/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable comma-dangle */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {domain} from 'gettext';
const {gettext: _} = domain('azclock');

export const ElementType = {
    DIGITAL_CLOCK: 0,
    ANALOG_CLOCK: 1,
    TEXT_LABEL: 2,
    COMMAND_LABEL: 3,
};

export function getSettings(extension, schema, path) {
    const schemaDir = extension.dir.get_child('schemas');
    let schemaSource;
    if (schemaDir.query_exists(null)) {
        schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir.get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false
        );
    } else {
        schemaSource = Gio.SettingsSchemaSource.get_default();
    }

    const schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj) {
        throw new Error(`Desktop Clock Error! Unable to find/create schema ${schema} with path ${path}.
                            Please report the issue at https://gitlab.com/AndrewZaech/azclock/-/issues`);
    }

    const args = {settings_schema: schemaObj};
    if (path)
        args.path = path;

    return new Gio.Settings(args);
}

// A bug in v11 created empty widget data to 'widgets' setting.
// This function will remove all empty widget data.
export function removeEmptyWidgetData(extension, settings) {
    const widgets = settings.get_value('widgets').deepUnpack();

    let emptyWidgetDataRemoved = false;
    for (let i = 0; i < widgets.length; i++) {
        if (Object.keys(widgets[i]).length === 0) {
            emptyWidgetDataRemoved = true;
            widgets.splice(i, 1);
        }
    }

    if (emptyWidgetDataRemoved)
        settings.set_value('widgets', new GLib.Variant('aa{sv}', widgets));
}

export function createInitialWidget(extension, settings) {
    const needsInitialWidget = settings.get_boolean('create-initial-widget');

    // The initial widget has already been created
    if (!needsInitialWidget)
        return;

    let hasWidgets = false;
    const newWidgets = settings.get_value('widgets').recursiveUnpack();
    newWidgets.forEach(widget => {
        for (const [widgetId, properties_] of Object.entries(widget)) {
            if (widgetId) {
                hasWidgets = true;
                break;
            }
        }
    });

    // New wigdet format already exists
    if (hasWidgets) {
        settings.set_boolean('create-initial-widget', false);
        return;
    }

    const widgets = [];
    const widget = {};
    let randomId = GLib.uuid_string_random();
    const widgetSchema = `${settings.schema_id}.widget-data`;
    const widgetPath = `${settings.path}widget-data/${randomId}/`;
    const widgetSettings = getSettings(extension, widgetSchema, widgetPath);

    widget[randomId] = new GLib.Variant('a{sv}', {
        enabled: GLib.Variant.new_boolean(true),
    });
    widgets.push(widget);

    const elements = widgetSettings.get_value('elements').deepUnpack();
    const elementSchema = `${settings.schema_id}.element-data`;
    const elementPath = `${widgetSettings.path}element-data/`;
    let element = {};
    widgetSettings.set_string('name', _('Digital Clock Widget'));

    randomId = GLib.uuid_string_random();
    let elementSettings = getSettings(extension, elementSchema, `${elementPath}${randomId}/`);
    element[randomId] = new GLib.Variant('a{sv}', {
        enabled: GLib.Variant.new_boolean(true),
    });
    elements.push(element);
    elementSettings.set_string('name', _('Time Label'));

    element = {};
    randomId = GLib.uuid_string_random();
    elementSettings = getSettings(extension, elementSchema, `${elementPath}${randomId}/`);
    element[randomId] = new GLib.Variant('a{sv}', {
        enabled: GLib.Variant.new_boolean(true),
    });
    elements.push(element);
    elementSettings.set_string('name', _('Date Label'));
    elementSettings.set_string('date-format', '%A %b %d');
    elementSettings.set_int('font-size', 32);

    widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', elements));
    settings.set_value('widgets', new GLib.Variant('aa{sv}', widgets));
    settings.set_boolean('create-initial-widget', false);
}

export function convertOldSettings(extension, settings) {
    const oldWidgetsData = settings.get_value('widget-data').deepUnpack();
    if (oldWidgetsData.length === 0)
        return;

    const widgets = [];
    for (let i = 0; i < oldWidgetsData.length; i++) {
        const oldWidgetData = oldWidgetsData[i];

        const widget = {};
        // The first entry in old widget data stores the 'widget box' data
        // Create a new relocatable widget-data schema based on the old settings.
        let randomId = GLib.uuid_string_random();
        const widgetSchema = `${settings.schema_id}.widget-data`;
        const widgetPath = `${settings.path}widget-data/${randomId}/`;
        const widgetSettings = getSettings(extension, widgetSchema, widgetPath);
        widget[randomId] = new GLib.Variant('a{sv}', {
            enabled: GLib.Variant.new_boolean(true),
        });
        widgets.push(widget);

        // Convert the old widget data to new relocatable widget-data schema
        convertWidgetData(oldWidgetsData, i, 0, widgetSettings);

        const elements = [];
        // All other entries store the 'elements' data
        for (let j = 1; j < oldWidgetData.length; j++) {
            // Create a new relocatable element-data schema based on the old settings.
            const element = {};
            randomId = GLib.uuid_string_random();
            const elementSchema = `${settings.schema_id}.element-data`;
            const elementPath = `${widgetSettings.path}element-data/${randomId}/`;
            const elementSettings = getSettings(extension, elementSchema, elementPath);
            element[randomId] = new GLib.Variant('a{sv}', {
                enabled: GLib.Variant.new_boolean(true),
            });
            elements.push(element);

            // Convert the old element data to new relocatable element-data schema
            convertElementData(oldWidgetsData, i, j, elementSettings);
        }

        // Store the elements relocatable schema id in the widget settings 'element' setting
        widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', elements));
    }

    // Store the widgets relocatable schema id in the 'widgets' setting
    settings.set_value('widgets', new GLib.Variant('aa{sv}', widgets));
    // Clear the old 'widget-data' setting
    settings.set_value('widget-data', new GLib.Variant('aaa{ss}', []));
}

function convertWidgetData(widgetsData, widgetIndex, elementIndex, settings) {
    const getWidgetData = (key, type) => {
        return getData(widgetsData, widgetIndex, elementIndex, key, type);
    };

    const setValue = (key, variant, value) => {
        const defaultValue = settings.get_default_value(key);
        const newValue = new GLib.Variant(variant, value);
        if (!defaultValue.equal(newValue))
            settings.set_value(key, new GLib.Variant(variant, value));
    };

    setValue('name', 's', getWidgetData('Name'));
    setValue('lock-widget', 'b', getWidgetData('Lock_Widget', 'bool'));

    const locationX = getWidgetData('Location_X', 'int');
    const locationY = getWidgetData('Location_Y', 'int');
    setValue('location', '(ii)', [locationX, locationY]);

    setValue('show-background', 'b', getWidgetData('Box_BackgroundEnabled', 'bool'));
    setValue('background-color', 's', getWidgetData('Box_BackgroundColor'));

    setValue('show-border', 'b', getWidgetData('Box_BorderEnabled', 'bool'));
    setValue('border-width', 'i', getWidgetData('Box_BorderWidth', 'int'));
    setValue('border-radius', 'i', getWidgetData('Box_BorderRadius', 'int'));
    setValue('border-color', 's', getWidgetData('Box_BorderColor'));

    setValue('spacing', 'i', getWidgetData('Box_Spacing', 'int'));

    const pTop = getWidgetData('Box_Padding_Top', 'int');
    const pRight = getWidgetData('Box_Padding_Right', 'int');
    const pBottom = getWidgetData('Box_Padding_Bottom', 'int');
    const pLeft = getWidgetData('Box_Padding_Left', 'int');
    setValue('padding', '(iiii)', [pTop, pRight, pBottom, pLeft]);

    setValue('vertical', 'b', getWidgetData('Box_VerticalLayout', 'bool'));

    const anchorPoint = getWidgetData('Box_AnchorPoint', 'int');
    let anchorPointString = 'Top_Left';
    if (anchorPoint === 0)
        anchorPointString = 'Top_Left';
    else if (anchorPoint === 1)
        anchorPointString = 'Bottom_Left';
    else if (anchorPoint === 2)
        anchorPointString = 'Top_Right';
    else if (anchorPoint === 3)
        anchorPointString = 'Bottom_Right';
    else if (anchorPoint === 4)
        anchorPointString = 'Center';

    setValue('anchor-point', 's', anchorPointString);
}

function convertElementData(widgetsData, widgetIndex, elementIndex, settings) {
    const getElementData = (key, type) => {
        return getData(widgetsData, widgetIndex, elementIndex, key, type);
    };

    const setValue = (key, variant, value) => {
        const defaultValue = settings.get_default_value(key);
        const newValue = new GLib.Variant(variant, value);
        if (!defaultValue.equal(newValue))
            settings.set_value(key, new GLib.Variant(variant, value));
    };

    setValue('name', 's', getElementData('Name'));

    const elementTypeString = getElementData('Element_Type');
    let elementType = 0;
    if (elementTypeString === 'Digital_Clock')
        elementType = 0;
    else if (elementTypeString === 'Analog_Clock')
        elementType = 1;
    else if (elementTypeString === 'Text_Label')
        elementType = 2;
    else if (elementTypeString === 'Command_Label')
        elementType = 3;
    settings.set_enum('element-type', elementType);

    const pTop = getElementData('Element_Padding_Top', 'int');
    const pRight = getElementData('Element_Padding_Right', 'int');
    const pBottom = getElementData('Element_Padding_Bottom', 'int');
    const pLeft = getElementData('Element_Padding_Left', 'int');
    setValue('padding', '(iiii)', [pTop, pRight, pBottom, pLeft]);

    const mTop = getElementData('Element_Margin_Top', 'int');
    const mRight = getElementData('Element_Margin_Right', 'int');
    const mBottom = getElementData('Element_Margin_Bottom', 'int');
    const mLeft = getElementData('Element_Margin_Left', 'int');
    setValue('margin', '(iiii)', [mTop, mRight, mBottom, mLeft]);

    const tzOverride = getElementData('TimeZoneOverrideEnabled', 'bool');
    const tz = getElementData('TimeZoneOverride') || 'UTC';
    setValue('timezone-override', '(bs)', [tzOverride, tz]);

    if (elementTypeString === 'Analog_Clock') {
        convertAnalogClockData(widgetsData, widgetIndex, elementIndex, settings);
        return;
    }

    convertOldShadowValues('Text_Shadow', 'shadow', setValue, getElementData);

    setValue('foreground-color', 's', getElementData('Text_Color'));
    setValue('show-background', 'b', getElementData('Text_BackgroundEnabled', 'bool'));
    setValue('background-color', 's', getElementData('Text_BackgroundColor'));

    setValue('show-border', 'b', getElementData('Text_BorderEnabled', 'bool'));
    setValue('border-width', 'i', getElementData('Text_BorderWidth', 'int'));
    setValue('border-radius', 'i', getElementData('Text_BorderRadius', 'int'));
    setValue('border-color', 's', getElementData('Text_BorderColor'));

    setValue('font-size', 'i', getElementData('Text_Size', 'int'));
    setValue('date-format', 's', getElementData('Text_DateFormat'));

    setValue('text-align-x', 's', getElementData('Text_AlignmentX'));
    setValue('text-align-y', 's', getElementData('Text_AlignmentY'));
    setValue('line-alignment', 's', getElementData('Text_LineAlignment'));

    // Labels General:
    const overrideFontFamily = getElementData('Text_CustomFontEnabled', 'bool');
    const fontFamily = getElementData('Text_CustomFontFamily');
    setValue('font-family-override', '(bs)', [overrideFontFamily, fontFamily]);
    setValue('font-weight', 'i', getElementData('Text_CustomFontWeight', 'int'));
    const fontStyle = getElementData('Text_CustomFontStyle', 'int');
    let fontStyleString = 'Normal';
    if (fontStyle === 1)
        fontStyleString = 'Oblique';
    else if (fontStyle === 2)
        fontStyleString = 'Italic';
    setValue('font-style', 's', fontStyleString);

    // Command Labels:
    setValue('command', 's', getElementData('Text_Command'));
    setValue('polling-interval', 'i', getElementData('Text_PollingInterval', 'int'));

    // Text Labels:
    setValue('text', 's', getElementData('Text_Text') || 'Text');
}

function convertAnalogClockData(widgetsData, widgetIndex, elementIndex, settings) {
    const getElementData = (key, type) => {
        return getData(widgetsData, widgetIndex, elementIndex, key, type);
    };

    const setValue = (key, variant, value) => {
        const defaultValue = settings.get_default_value(key);
        const newValue = new GLib.Variant(variant, value);
        if (!defaultValue.equal(newValue))
            settings.set_value(key, new GLib.Variant(variant, value));
    };

    setValue('clock-size', 'i', getElementData('Clock_Size', 'int'));
    setValue('smooth-hand-ticks', 'b', getElementData('Clock_SmoothTicks', 'bool'));
    setValue('minute-hand-adjust-with-seconds', 'b', getElementData('MinuteHand_AdjustWithSeconds', 'bool'));

    setValue('clock-face-visible', 'b', getElementData('ClockFace_Visible', 'bool'));
    setValue('clock-face-style', 'i', getElementData('ClockFace_Style', 'int'));

    setValue('foreground-color', 's', getElementData('ClockFace_Color'));
    setValue('show-background', 'b', getElementData('ClockFace_BackgroundEnabled', 'bool'));
    setValue('background-color', 's', getElementData('ClockFace_BackgroundColor'));

    setValue('show-border', 'b', getElementData('ClockFace_BorderEnabled', 'bool'));
    setValue('border-width', 'i', getElementData('ClockFace_BorderWidth', 'int'));
    setValue('border-radius', 'i', getElementData('ClockFace_BorderRadius', 'int'));
    setValue('border-color', 's', getElementData('ClockFace_BorderColor'));

    convertOldShadowValues('ClockFace_Shadow', 'shadow', setValue, getElementData);
    convertOldShadowValues('ClockFace_BoxShadow', 'clock-face-shadow', setValue, getElementData);

    // Clock Button
    setValue('clock-button-visible', 'b', getElementData('ClockButton_Visible', 'bool'));
    setValue('clock-button-color', 's', getElementData('ClockButton_Color'));
    setValue('clock-button-style', 'i', getElementData('ClockButton_Style', 'int'));
    convertOldShadowValues('ClockButton_Shadow', 'clock-button-shadow', setValue, getElementData);

    // Second Hand
    setValue('second-hand-visible', 'b', getElementData('SecondHand_Visible', 'bool'));
    setValue('second-hand-color', 's', getElementData('SecondHand_Color'));
    setValue('second-hand-style', 'i', getElementData('SecondHand_Style', 'int'));
    convertOldShadowValues('SecondHand_Shadow', 'second-hand-shadow', setValue, getElementData);

    // Minute Hand
    setValue('minute-hand-color', 's', getElementData('MinuteHand_Color'));
    setValue('minute-hand-style', 'i', getElementData('MinuteHand_Style', 'int'));
    convertOldShadowValues('MinuteHand_Shadow', 'minute-hand-shadow', setValue, getElementData);

    // Hour Hand
    setValue('hour-hand-color', 's', getElementData('HourHand_Color'));
    setValue('hour-hand-style', 'i', getElementData('HourHand_Style', 'int'));
    convertOldShadowValues('HourHand_Shadow', 'hour-hand-shadow', setValue, getElementData);
}

function convertOldShadowValues(oldSettingName, newSetting, setValue, getElementData) {
    const shadowEnabled = getElementData(`${oldSettingName}Enabled`, 'bool');
    const shadowColor = getElementData(`${oldSettingName}Color`);
    const shadowX = getElementData(`${oldSettingName}X`, 'int');
    const shadowY = getElementData(`${oldSettingName}Y`, 'int');
    const shadowSpread = getElementData(`${oldSettingName}Spread`, 'int');
    const shadowBlur = getElementData(`${oldSettingName}Blur`, 'int');
    setValue(newSetting, '(bsiiii)', [shadowEnabled, shadowColor, shadowX, shadowY, shadowSpread, shadowBlur]);
}

export function getData(data, widgetIndex, elementIndex, elementKey, parseType) {
    const desktopWidgets = data;

    const clockData = desktopWidgets[widgetIndex];
    const element = clockData[elementIndex][elementKey];

    if (!parseType) {
        return element || '';
    } else if (parseType === 'int') {
        return parseInt(element) || 0;
    } else if (parseType === 'float') {
        return parseFloat(element) || 0;
    } else if (parseType === 'bool') {
        return element === 'true';
    } else if (parseType === 'align') {
        if (element === 'Start')
            return 'left';
        else if (element === 'Center')
            return 'center';
        else if (element === 'End')
            return 'right';
    } else if (parseType === 'clutter_align') {
        if (element === 'Start')
            return 1; // Clutter.ActorAlign.START;
        else if (element === 'Center')
            return 2; // Clutter.ActorAlign.CENTER;
        else if (element === 'End')
            return 3; // Clutter.ActorAlign.END;
    }
}
