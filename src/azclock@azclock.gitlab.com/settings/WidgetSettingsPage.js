import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {CommandLabelSubPage} from './CommandLabelSubPage.js';
import {DialogWindow} from './DialogWindow.js';
import {DigitalClockSubPage} from './DigitalClockSubPage.js';
import {AnalogClockSubPage} from './AnalogClockSubPage.js';
import {TextLabelSubPage} from './TextLabelSubPage.js';
import {WidgetSubPage} from './WidgetSubPage.js';
import * as Utils from '../utils.js';

const ElementType = {
    DATE: 0,
    TIME: 1,
    ANALOG: 2,
    TEXT: 3,
    COMMAND: 4,
};

export const WidgetSettingsPage = GObject.registerClass({
    Properties: {
        'title': GObject.ParamSpec.string(
            'title', 'title', 'title',
            GObject.ParamFlags.READWRITE,
            ''),
        'schema-id': GObject.ParamSpec.string(
            'schema-id', 'schema-id', 'schema-id',
            GObject.ParamFlags.READWRITE,
            null),
        'widget-index': GObject.ParamSpec.int(
            'widget-index', 'widget-index', 'widget-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
    },
}, class AzClockWidgetSettingsPage extends Adw.ApplicationWindow {
    _init(settings, widgetSettings, params) {
        super._init({
            ...params,
        });

        this._extension = ExtensionPreferences.lookupByURL(import.meta.url);
        this._settings = settings;
        this._widgetSettings = widgetSettings;
        this._pages = [];

        const elements = this._widgetSettings.get_value('elements').recursiveUnpack();
        const widgetName = this._widgetSettings.get_string('name');

        // The window content widget
        const navSplitView = new Adw.NavigationSplitView();
        this.set_content(navSplitView);

        // The main content stack
        this._widgetElementsStack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.CROSSFADE,
        });

        // Sidebar
        const sidebarToolBarView = new Adw.ToolbarView();
        const sidebarHeaderBar = new Adw.HeaderBar({
            show_back_button: false,
        });
        sidebarToolBarView.add_top_bar(sidebarHeaderBar);
        const sidebarScrolledWindow = new Gtk.ScrolledWindow();
        sidebarToolBarView.set_content(sidebarScrolledWindow);
        const sidebarPage = new Adw.NavigationPage({
            title: _('Configure Widget'),
        });
        sidebarPage.set_child(sidebarToolBarView);
        navSplitView.set_sidebar(sidebarPage);

        // Sidebar List Box
        this._sidebarListBox = new Gtk.ListBox({
            css_classes: ['navigation-sidebar'],
        });
        sidebarScrolledWindow.set_child(this._sidebarListBox);
        this._sidebarListBox.connect('row-selected', (_self, row) => {
            if (!row)
                return;

            const {settingPage} = row;
            this._widgetPage.title = settingPage.title;
            this._widgetElementsStack.set_visible_child(settingPage);
            deleteElementButton.visible = row.get_index() !== 0;
            deleteWidgetButton.visible = row.get_index() === 0;
            addButton.visible = row.get_index() === 0;
        });
        this._sidebarListBox.set_header_func(row => {
            if (row.get_index() === 1) {
                const separator = new Gtk.Separator({
                    orientation: Gtk.Orientation.HORIZONTAL,
                });
                row.set_header(separator);
            } else {
                row.set_header(null);
            }
        });

        // Populate sidebar and main content stack
        this.createWidgetSettingsPage(0);
        elements.forEach((element, index) => {
            for (const [elementId] of Object.entries(element)) {
                const elementSchema = `${this._settings.schema_id}.element-data`;
                const elementPath = `${this._widgetSettings.path}element-data/${elementId}/`;
                const elementSettings = Utils.getSettings(this._extension, elementSchema, elementPath);
                this.createWidgetSettingsPage(index, elementSettings, elementId);
            }
        });

        // Content ToolbarView
        this._contentToolBarView = new Adw.ToolbarView();
        const contentHeaderBar = new Adw.HeaderBar({
            show_back_button: false,
        });
        this._contentToolBarView.add_top_bar(contentHeaderBar);

        const actionBar = new Gtk.ActionBar();
        const deleteWidgetButton = new Gtk.Button({
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            label: _('Delete Widget'),
            css_classes: ['destructive-action'],
        });
        deleteWidgetButton.connect('clicked', () => {
            const dialog = new Gtk.MessageDialog({
                text: `<b>${_('Delete %s?').format(_(widgetName))}</b>`,
                secondary_text: _('Please confirm you wish to delete %s.').format(_(widgetName)),
                use_markup: true,
                buttons: Gtk.ButtonsType.YES_NO,
                message_type: Gtk.MessageType.WARNING,
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.connect('response', (widget, response) => {
                if (response === Gtk.ResponseType.YES) {
                    const widgets = this._settings.get_value('widgets').deepUnpack();
                    widgets.splice(this.widgetIndex, 1);
                    this._settings.set_value('widgets', new GLib.Variant('aa{sv}', widgets));

                    for (const page of this._pages) {
                        const pageSettings = page.elementSettings ?? page.widgetSettings;
                        const keys = pageSettings.settings_schema.list_keys();
                        for (const key of keys)
                            pageSettings.reset(key);
                    }

                    this.close();
                    this._extension.createRows();
                }
                dialog.destroy();
            });
            dialog.show();
        });
        const deleteElementButton = new Gtk.Button({
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
            hexpand: false,
            label: _('Delete Element'),
            css_classes: ['destructive-action'],
            visible: false,
        });
        deleteElementButton.connect('clicked', () => {
            const elementSettingsPage = this._widgetElementsStack.get_visible_child();
            const elementSettings = elementSettingsPage.elementSettings;
            const elementIndex = elementSettingsPage.elementIndex;

            const name = elementSettings.get_string('name');
            const dialog = new Gtk.MessageDialog({
                text: `<b>${_('Delete %s?').format(_(name))}</b>`,
                secondary_text: _('Please confirm you wish to delete %s.').format(_(name)),
                use_markup: true,
                buttons: Gtk.ButtonsType.YES_NO,
                message_type: Gtk.MessageType.WARNING,
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.connect('response', (_widget, response) => {
                if (response === Gtk.ResponseType.YES) {
                    const newElements = this._widgetSettings.get_value('elements').deepUnpack();
                    newElements.splice(elementIndex, 1);

                    this._widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', newElements));

                    const keys = elementSettings.settings_schema.list_keys();
                    for (const key of keys)
                        elementSettings.reset(key);

                    this._repopulatePages(0);
                }
                dialog.destroy();
            });
            dialog.show();
        });

        const addButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            label: _('Add Element'),
            css_classes: ['suggested-action'],
        });
        addButton.connect('clicked', () => {
            const dialog = new AddElementsDialog(this._settings, this._widgetSettings, this, {
                widget_title: this.title,
            });
            dialog.show();
            dialog.connect('response', (_w, response) => {
                if (response === Gtk.ResponseType.APPLY) {
                    this._repopulatePages(dialog.elementIndex);
                    dialog.destroy();
                }
            });
        });
        actionBar.pack_end(addButton);
        actionBar.pack_start(deleteWidgetButton);
        actionBar.pack_start(deleteElementButton);
        this._contentToolBarView.add_bottom_bar(actionBar);

        this._contentToolBarView.set_content(this._widgetElementsStack);
        this._widgetPage = new Adw.NavigationPage({
            title: widgetName,
        });
        this._widgetPage.set_child(this._contentToolBarView);
        navSplitView.set_content(this._widgetPage);
    }

    _repopulatePages(selectRowIndex = null) {
        this._pages = [];
        this._contentToolBarView.content.visible = false;

        // remove all from sidebar
        this._sidebarListBox.remove_all();

        // remove all from content stack
        let child = this._widgetElementsStack.get_first_child();
        while (child !== null) {
            const next = child.get_next_sibling();
            this._widgetElementsStack.remove(child);
            child = next;
        }

        const elements = this._widgetSettings.get_value('elements').recursiveUnpack();
        this.createWidgetSettingsPage(0);
        elements.forEach((element, index) => {
            for (const [elementId] of Object.entries(element)) {
                const elementSchema = `${this._settings.schema_id}.element-data`;
                const elementPath = `${this._widgetSettings.path}element-data/${elementId}/`;
                const elementSettings = Utils.getSettings(this._extension, elementSchema, elementPath);
                this.createWidgetSettingsPage(index, elementSettings, elementId);
            }
        });

        // select a row if set
        if (selectRowIndex !== null) {
            const row = this._sidebarListBox.get_row_at_index(selectRowIndex);
            this._sidebarListBox.select_row(row);
        }
        this._contentToolBarView.content.visible = true;
    }

    createWidgetSettingsPage(index, elementSettings = null, elementId = null) {
        const isWidgetPage = elementSettings === null;
        const settings = elementSettings ?? this._widgetSettings;

        const title = settings.get_string('name');
        const listBoxRowLabel = new Gtk.Label({
            xalign: 0,
            halign: Gtk.Align.FILL,
            hexpand: true,
            label: _(title),
            max_width_chars: 25,
            wrap: true,
        });
        const listBoxRow = new Gtk.ListBoxRow({
            child: listBoxRowLabel,
        });
        this._sidebarListBox.append(listBoxRow);

        let settingPageConstructor;
        if (isWidgetPage) {
            settingPageConstructor = WidgetSubPage;
        } else {
            const elementType = settings.get_enum('element-type');
            if (elementType === Utils.ElementType.DIGITAL_CLOCK)
                settingPageConstructor = DigitalClockSubPage;
            else if (elementType === Utils.ElementType.ANALOG_CLOCK)
                settingPageConstructor = AnalogClockSubPage;
            else if (elementType === Utils.ElementType.TEXT_LABEL)
                settingPageConstructor = TextLabelSubPage;
            else if (elementType === Utils.ElementType.COMMAND_LABEL)
                settingPageConstructor = CommandLabelSubPage;
        }

        if (settingPageConstructor === undefined)
            return;

        const settingPage = new settingPageConstructor({
            title: _(title),
            is_widget: isWidgetPage,
            schemaId: elementId ?? this.schema_id,
            main_settings: this._settings,
            widget_settings: this._widgetSettings,
            widget_index: this.widgetIndex,
            element_settings: elementSettings,
            element_index: index,
        });
        this._widgetElementsStack.add_child(settingPage);

        settingPage.connect('notify::title', () => {
            if (isWidgetPage)
                this.title = settingPage.title;

            listBoxRowLabel.label = settingPage.title;
            this._widgetPage.title = settingPage.title;
        });

        settingPage.connect('notify::element-index', () => {
            const elements = this._widgetSettings.get_value('elements').deepUnpack();
            const oldIndex = settingPage.oldIndex;
            const newIndex = settingPage.elementIndex;

            const movedData = elements.splice(oldIndex, 1)[0];
            elements.splice(newIndex, 0, movedData);

            this._widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', elements));

            this._repopulatePages(newIndex + 1);
        });
        listBoxRow.settingPage = settingPage;
        this._pages.push(settingPage);
    }
});

var AddElementsDialog = GObject.registerClass(
class AzClockAddElementsDialog extends DialogWindow {
    _init(settings, widgetSettings, parent, params) {
        super._init(_('Add Element to %s').format(params.widget_title), parent, params);
        this._settings = settings;
        this._widgetSettings = widgetSettings;
        this._extension = parent._extension;
        this.search_enabled = false;
        this.set_default_size(550, -1);

        this.pageGroup.title = _('Preset Elements');
        this.pageGroup.add(this.addPresetElement(_('Date Label'), ElementType.DATE));
        this.pageGroup.add(this.addPresetElement(_('Time Label'), ElementType.TIME));
        this.pageGroup.add(this.addPresetElement(_('Text Label'), ElementType.TEXT));
        this.pageGroup.add(this.addPresetElement(_('Command Label'), ElementType.COMMAND));
        this.pageGroup.add(this.addPresetElement(_('Analog Clock'), ElementType.ANALOG));

        this.cloneGroup = new Adw.PreferencesGroup({
            title: _('Clone existing Element'),
        });
        this.cloneGroup.use_markup = true;
        this.page.add(this.cloneGroup);

        const widgets = this._settings.get_value('widgets').recursiveUnpack();
        widgets.forEach(widget => {
            for (const [widgetId] of Object.entries(widget)) {
                const wSchema = `${this._settings.schema_id}.widget-data`;
                const wPath = `${this._settings.path}widget-data/${widgetId}/`;
                const wSettings = Utils.getSettings(this._extension, wSchema, wPath);

                const name = wSettings.get_string('name');
                const elements = wSettings.get_value('elements').recursiveUnpack();
                elements.forEach(element => {
                    for (const [elementId] of Object.entries(element)) {
                        const widgetName = name;
                        const elementSchema = `${this._settings.schema_id}.element-data`;
                        const elementPath = `${wSettings.path}element-data/`;
                        const elementSettings = Utils.getSettings(this._extension, elementSchema, `${elementPath}${elementId}/`);
                        const elementName = elementSettings.get_string('name');
                        this.cloneGroup.add(this.addPresetElement(`${_(elementName)} <span font-size='small'><i>(${_(widgetName)})</i></span>`, elementSettings));
                    }
                });
            }
        });
    }

    addPresetElement(title, widgetType, subtitle) {
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
        });

        addButton.connect('clicked', () => {
            const elements = this._widgetSettings.get_value('elements').deepUnpack();
            const elementSchema = `${this._settings.schema_id}.element-data`;
            const elementPath = `${this._widgetSettings.path}element-data/`;

            const element = {};
            const randomId = GLib.uuid_string_random();
            const elementSettings = Utils.getSettings(this._extension, elementSchema, `${elementPath}${randomId}/`);
            element[randomId] = new GLib.Variant('a{sv}', {
                enabled: GLib.Variant.new_boolean(true),
            });
            elements.push(element);

            if (widgetType === ElementType.DATE) {
                elementSettings.set_string('name', _('Date Label'));
                elementSettings.set_string('date-format', '%A %b %d');
                elementSettings.set_int('font-size', 32);
            } else if (widgetType === ElementType.TIME) {
                elementSettings.set_string('name', _('Time Label'));
            } else if (widgetType === ElementType.TEXT) {
                elementSettings.set_string('name', _('Text Label'));
                elementSettings.set_enum('element-type', Utils.ElementType.TEXT_LABEL);
            } else if (widgetType === ElementType.COMMAND) {
                elementSettings.set_string('name', _('Command Label'));
                elementSettings.set_enum('element-type', Utils.ElementType.COMMAND_LABEL);
            } else if (widgetType === ElementType.ANALOG) {
                elementSettings.set_string('name', _('Analog Clock'));
                elementSettings.set_enum('element-type', Utils.ElementType.ANALOG_CLOCK);
                elementSettings.set_value('shadow', new GLib.Variant('(bsiiii)', [true, 'rgba(55, 55, 55, 0.3)', 3, 3, 0, 0]));
                elementSettings.set_int('border-radius', 999);
                elementSettings.set_int('border-width', 2);
                elementSettings.set_string('background-color', 'white');
                elementSettings.set_boolean('show-border', true);
                elementSettings.set_string('border-color', 'black');
                elementSettings.set_string('foreground-color', 'black');
            } else {
                const setValue = (copySetting, newSetting, key) => {
                    const defaultValue = copySetting.get_default_value(key);
                    const value = copySetting.get_value(key);
                    if (!defaultValue.equal(value))
                        newSetting.set_value(key, value);
                };

                const copyElementSettings = widgetType;

                const elementKeys = copyElementSettings.settings_schema.list_keys();
                for (const key of elementKeys)
                    setValue(copyElementSettings, elementSettings, key);
            }

            this._widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', elements));
            this.emit('response', Gtk.ResponseType.APPLY);
        });

        const row = new Adw.ActionRow({
            subtitle: subtitle ? _(subtitle) : '',
            title: _(title),
            activatable_widget: addButton,
        });

        row.add_suffix(addButton);
        return row;
    }
});
