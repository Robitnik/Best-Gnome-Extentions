import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const MAX_LOCATIONS = 12;

/**
 * Check for GWeather v4 package.
 * GWeather v3 throws errors wit Gtk4.
 *
 * @returns GWeather v4 or null
 */
const loadGWeather = async () => {
    try {
        const {default: module} = await import('gi://GWeather?version=4.0');
        return module;
    } catch (e) {
        return null;
    }
};
const GWeather = await loadGWeather();

export const SubPage = GObject.registerClass({
    Properties: {
        'schema-id': GObject.ParamSpec.string(
            'schema-id', 'schema-id', 'schema-id',
            GObject.ParamFlags.READWRITE,
            null),
        'is-widget': GObject.ParamSpec.boolean(
            'is-widget', 'is-widget', 'is-widget',
            GObject.ParamFlags.READWRITE,
            false),
        'main-settings': GObject.ParamSpec.object(
            'main-settings', 'main-settings', 'main-settings',
            GObject.ParamFlags.READWRITE,
            Gio.Settings.$gtype),
        'widget-settings': GObject.ParamSpec.object(
            'widget-settings', 'widget-settings', 'widget-settings',
            GObject.ParamFlags.READWRITE,
            Gio.Settings.$gtype),
        'widget-index': GObject.ParamSpec.int(
            'widget-index', 'widget-index', 'widget-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
        'element-settings': GObject.ParamSpec.object(
            'element-settings', 'element-settings', 'element-settings',
            GObject.ParamFlags.READWRITE,
            Gio.Settings.$gtype),
        'element-index': GObject.ParamSpec.int(
            'element-index', 'element-index', 'element-index',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXINT32, 0),
    },
}, class AzClockSubPage extends Adw.PreferencesPage {
    _init(params) {
        super._init({
            ...params,
        });

        this.children = [];

        this.settings = this.elementSettings ?? this.widgetSettings;

        this.topGroup = new Adw.PreferencesGroup();
        this.add(this.topGroup);

        const nameEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            width_chars: 20,
            text: _(this.settings.get_string('name')),
        });
        nameEntry.connect('changed', () => {
            const newName = nameEntry.get_text();
            this.settings.set_string('name', newName);
            this.title = newName;
        });
        const nameRow = new Adw.ActionRow({
            title: this.is_widget ? _('Widget Name') : _('Element Name'),
            activatable_widget: nameEntry,
        });
        nameRow.add_suffix(nameEntry);
        this.topGroup.add(nameRow);

        const enabledSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._getEnabled(),
        });
        const enabledRow = new Adw.ActionRow({
            title: this.is_widget ? _('Enable Widget') : _('Enable Element'),
            activatable_widget: enabledSwitch,
        });
        enabledSwitch.connect('notify::active', widget => {
            this._setEnabled(widget.get_active());
        });
        enabledRow.add_suffix(enabledSwitch);
        this.topGroup.add(enabledRow);

        if (!this.is_widget) {
            const elements = this.widgetSettings.get_value('elements').recursiveUnpack();
            const lastElementIndex = elements.length - 1;
            const navGroup = new Adw.PreferencesGroup();
            this.add(navGroup);

            const navRow = new Adw.ActionRow({
                title: _('Move Element'),
            });
            navGroup.add(navRow);

            const navBox = new Gtk.Box({
                css_classes: ['linked'],
                spacing: 0,
            });
            navRow.add_suffix(navBox);

            const downButton = new Gtk.Button({
                icon_name: 'go-down-symbolic',
                valign: Gtk.Align.CENTER,
                sensitive: this.elementIndex !== lastElementIndex,
                tooltip_text: _('Move element down in order'),
            });
            navBox.append(downButton);
            downButton.connect('clicked', () => {
                this.oldIndex = this.elementIndex;
                this.elementIndex++;
            });

            const upButton = new Gtk.Button({
                icon_name: 'go-up-symbolic',
                valign: Gtk.Align.CENTER,
                sensitive: this.elementIndex !== 0,
                tooltip_text: _('Move element up in order'),
            });
            navBox.append(upButton);
            upButton.connect('clicked', () => {
                this.oldIndex = this.elementIndex;
                this.elementIndex--;
            });
        }
    }

    _getEnabled() {
        if (this.is_widget) {
            const widgets = this.mainSettings.get_value('widgets').recursiveUnpack();
            const [properties] = Object.values(widgets[this.widgetIndex]);
            return properties.enabled;
        }

        const elements = this.widgetSettings.get_value('elements').recursiveUnpack();
        const [properties] = Object.values(elements[this.elementIndex]);
        return properties.enabled;
    }

    _setEnabled(enabled) {
        if (this.is_widget) {
            const widgets = this.mainSettings.get_value('widgets').deepUnpack();
            const widget = {};
            widget[this.schema_id] = new GLib.Variant('a{sv}', {
                enabled: GLib.Variant.new_boolean(enabled),
            });
            widgets[this.widgetIndex] = widget;
            this.mainSettings.set_value('widgets', new GLib.Variant('aa{sv}', widgets));
            return;
        }

        const elements = this.widgetSettings.get_value('elements').deepUnpack();
        const element = {};
        element[this.schema_id] = new GLib.Variant('a{sv}', {
            enabled: GLib.Variant.new_boolean(enabled),
        });
        elements[this.elementIndex] = element;
        this.widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', elements));
    }

    _setVariantValue(setting, variantString, newValue, index) {
        const variant = this.settings.get_value(setting).deepUnpack();
        variant.splice(index, 1, newValue);
        this.settings.set_value(setting, new GLib.Variant(variantString, variant));
    }

    createShadowExpanderRow(title, setting) {
        const [shadowEnabled, shadowColor, shadowX, shadowY,
            shadowSpread, shadowBlur] = this.settings.get_value(setting).deepUnpack();

        const shadowExpanderRow = new Adw.ExpanderRow({
            title: _(title),
            show_enable_switch: true,
            expanded: false,
            enable_expansion: shadowEnabled,
        });
        shadowExpanderRow.connect('notify::enable-expansion', widget => {
            this._setVariantValue(setting, '(bsiiii)', widget.enable_expansion, 0);
        });

        const shadowColorButton = this.createColorButton(shadowColor);
        shadowColorButton.connect('color-set', widget => {
            this._setVariantValue(setting, '(bsiiii)', widget.get_rgba().to_string(), 1);
        });
        const shadowColorRow = new Adw.ActionRow({
            title: _('Shadow Color'),
            activatable_widget: shadowColorButton,
        });
        shadowColorRow.add_suffix(shadowColorButton);
        shadowExpanderRow.add_row(shadowColorRow);

        const xOffsetButton = this.createSpinButton(shadowX, -15, 15);
        xOffsetButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(bsiiii)', widget.get_value(), 2);
        });
        const xOffsetRow = new Adw.ActionRow({
            title: _('Shadow X Offset'),
            activatable_widget: xOffsetButton,
        });
        xOffsetRow.add_suffix(xOffsetButton);
        shadowExpanderRow.add_row(xOffsetRow);

        const yOffsetButton = this.createSpinButton(shadowY, -15, 15);
        yOffsetButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(bsiiii)', widget.get_value(), 3);
        });
        const yOffsetRow = new Adw.ActionRow({
            title: _('Shadow Y Offset'),
            activatable_widget: yOffsetButton,
        });
        yOffsetRow.add_suffix(yOffsetButton);
        shadowExpanderRow.add_row(yOffsetRow);

        const spreadButton = this.createSpinButton(shadowSpread, 0, 15);
        spreadButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(bsiiii)', widget.get_value(), 4);
        });
        const spreadRow = new Adw.ActionRow({
            title: _('Shadow Spread'),
            activatable_widget: spreadButton,
        });
        spreadRow.add_suffix(spreadButton);
        shadowExpanderRow.add_row(spreadRow);

        const blurButton = this.createSpinButton(shadowBlur, 0, 15);
        blurButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(bsiiii)', widget.get_value(), 5);
        });
        const blurRow = new Adw.ActionRow({
            title: _('Shadow Blur'),
            activatable_widget: blurButton,
        });
        blurRow.add_suffix(blurButton);
        shadowExpanderRow.add_row(blurRow);

        return shadowExpanderRow;
    }

    createPaddingMarginsExpander(setting, title) {
        const expanderRow = new Adw.ExpanderRow({
            title: _(title),
        });

        const [top, right, bottom, left] = this.settings.get_value(setting).deepUnpack();
        const topButton = this.createSpinButton(top, 0, 500);
        topButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(iiii)', widget.get_value(), 0);
        });
        const topRow = new Adw.ActionRow({
            title: _('Top'),
            activatable_widget: topButton,
        });
        topRow.add_suffix(topButton);
        expanderRow.add_row(topRow);

        const rightButton = this.createSpinButton(right, 0, 500);
        rightButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(iiii)', widget.get_value(), 1);
        });
        const rightRow = new Adw.ActionRow({
            title: _('Right'),
            activatable_widget: rightButton,
        });
        rightRow.add_suffix(rightButton);
        expanderRow.add_row(rightRow);

        const bottomButton = this.createSpinButton(bottom, 0, 500);
        bottomButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(iiii)', widget.get_value(), 2);
        });
        const bottomRow = new Adw.ActionRow({
            title: _('Bottom'),
            activatable_widget: bottomButton,
        });
        bottomRow.add_suffix(bottomButton);
        expanderRow.add_row(bottomRow);

        const leftButton = this.createSpinButton(left, 0, 500);
        leftButton.connect('value-changed', widget => {
            this._setVariantValue(setting, '(iiii)', widget.get_value(), 3);
        });
        const leftRow = new Adw.ActionRow({
            title: _('Left'),
            activatable_widget: leftButton,
        });
        leftRow.add_suffix(leftButton);
        expanderRow.add_row(leftRow);

        return expanderRow;
    }

    createSpinButton(value, lower, upper, digits = 0) {
        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower, upper, step_increment: 1, page_increment: 1, page_size: 0,
            }),
            climb_rate: 1,
            digits,
            numeric: true,
            valign: Gtk.Align.CENTER,
            value,
        });
        return spinButton;
    }

    createColorButton(value) {
        const rgba = new Gdk.RGBA();
        rgba.parse(value ?? '');
        const colorButton = new Gtk.ColorButton({
            rgba,
            use_alpha: true,
            valign: Gtk.Align.CENTER,
        });
        return colorButton;
    }

    createTimeZoneRow() {
        const timeZoneRow = new Adw.ActionRow({
            title: _('Time Zone'),
            activatable: true,
        });

        const [tzOverride, timeZone] = this.settings.get_value('timezone-override').deepUnpack();
        const timeZoneExpanderRow = new Adw.ExpanderRow({
            title: _('Override Time Zone'),
            show_enable_switch: true,
            expanded: tzOverride,
            enable_expansion: tzOverride,
        });
        timeZoneExpanderRow.connect('notify::enable-expansion', widget => {
            this._setVariantValue('timezone-override', '(bs)', widget.enable_expansion, 0);
        });
        timeZoneExpanderRow.add_row(timeZoneRow);

        if (!GWeather) {
            const linkButton = new Gtk.LinkButton({
                label: _('Time Zones Guide'),
                uri: 'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List',
                css_classes: ['caption'],
                valign: Gtk.Align.CENTER,
            });
            timeZoneExpanderRow.add_action(linkButton);
            timeZoneExpanderRow.subtitle = `${_('Search Disabled')}\n${_('Missing dependency GWeather v4')}`;
            timeZoneRow.title = _('Time Zone Database Name');

            const timeZoneEntry = new Gtk.Entry({
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.FILL,
                hexpand: true,
                text: timeZone || 'UTC',
            });

            const timeZoneApplyButton = new Gtk.Button({
                icon_name: 'object-select-symbolic',
                tooltip_text: _('Set Time Zone'),
                valign: Gtk.Align.CENTER,
            });
            timeZoneApplyButton.connect('clicked', () => {
                this._setVariantValue('timezone-override', '(bs)', timeZoneEntry.get_text(), 1);
            });

            timeZoneRow.add_suffix(timeZoneEntry);
            timeZoneRow.add_suffix(timeZoneApplyButton);

            return timeZoneExpanderRow;
        }

        const timeZoneLabel = new Gtk.Label({
            label: timeZone,
            use_markup: true,
        });
        const goNext = new Gtk.Image({icon_name: 'go-next-symbolic'});

        timeZoneRow.add_suffix(timeZoneLabel);
        timeZoneRow.add_suffix(goNext);

        timeZoneRow.connect('activated', () => {
            const timeZoneDialog = new TimeZoneDialog({
                title: _('Select Time Zone'),
                transient_for: this.get_root(),
                modal: true,
            });
            timeZoneDialog.show();

            timeZoneDialog.connect('time-zone-changed', (_self, tz, label) => {
                this._setVariantValue('timezone-override', '(bs)', tz, 1);
                // this.setClockElementData('TimeZone', label);
                timeZoneLabel.label = label;
            });
        });

        return timeZoneExpanderRow;
    }

    add(page) {
        this.children.push(page);
        super.add(page);
    }
});

var TimeZoneDialog = GObject.registerClass({
    Signals: {
        'time-zone-changed': {param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING]},
    },
}, class AzClockTimeZoneDialog extends Adw.Window {
    _init(params) {
        super._init({
            ...params,
            default_width: 400,
            default_height: 540,
        });

        this._locationsRows = [];

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.FILL,
            vexpand: true,
        });
        this.set_content(mainBox);

        const headerBar = new Adw.HeaderBar({
            show_start_title_buttons: true,
            show_end_title_buttons: true,
        });
        mainBox.append(headerBar);

        const searchEntry = new Gtk.SearchEntry();
        const searchBar = new Gtk.SearchBar({
            search_mode_enabled: true,
            child: searchEntry,
        });
        mainBox.append(searchBar);

        const stack = new Gtk.Stack();
        mainBox.append(stack);

        const page = new Adw.PreferencesPage({
            valign: Gtk.Align.FILL,
            vexpand: true,
        });
        stack.add_named(page, 'MainPage');

        const statusPage = new Adw.StatusPage({
            title: _('Search for a City'),
            icon_name: 'system-search-symbolic',
        });
        stack.add_named(statusPage, 'StatusPage');

        this._searchResultsGroup = new Adw.PreferencesGroup({
            valign: Gtk.Align.FILL,
        });
        page.add(this._searchResultsGroup);

        stack.set_visible_child_name('StatusPage');

        searchEntry.connect('search-changed', () => {
            for (let i = this._locationsRows.length - 1; i >= 0; i -= 1) {
                this._searchResultsGroup.remove(this._locationsRows[i]);
                this._locationsRows.pop();
            }

            if (searchEntry.text === '') {
                // EMPTY SEARCH
                statusPage.title = _('Search for a City');
                stack.set_visible_child_name('StatusPage');
                return;
            }

            const search = searchEntry.text.normalize().toLowerCase();

            const world = GWeather.Location.get_world();

            this.queryLocations(world, search);

            if (this._locationsRows.length === 0) {
                // NO RESULTS
                statusPage.title = _('No results.');
                stack.set_visible_child_name('StatusPage');
                return;
            }

            stack.set_visible_child_name('MainPage');

            this._locationsRows.sort((a, b) => {
                var nameA = a.location.get_sort_name();
                var nameB = b.location.get_sort_name();
                return nameA.localeCompare(nameB);
            });

            this._locationsRows.forEach(row => {
                this._searchResultsGroup.add(row);
            });
        });
    }

    queryLocations(location, search) {
        if (this._locationsRows.length >= MAX_LOCATIONS)
            return;

        switch (location.get_level()) {
        case GWeather.LocationLevel.CITY: {
            const containsName = location.get_sort_name().includes(search);

            let countryName = location.get_country_name();
            if (countryName != null)
                countryName = countryName.normalize().toLowerCase();

            const containsCountryName = countryName != null && countryName.includes(search);

            if (containsName || containsCountryName) {
                const row = this.createLocationRow(location);
                this._locationsRows.push(row);
            }
            return;
        }
        case GWeather.LocationLevel.NAMED_TIMEZONE:
            if (location.get_sort_name().includes(search)) {
                const row = this.createLocationRow(location);
                this._locationsRows.push(row);
            }
            return;
        default:
            break;
        }

        let loc = location.next_child(null);
        while (loc !== null) {
            this.queryLocations(loc, search);
            if (this._locationsRows.length >= MAX_LOCATIONS)
                return;

            loc = location.next_child(loc);
        }
    }

    createLocationRow(location) {
        const interval = location.get_timezone().find_interval(GLib.TimeType.UNIVERSAL, Gdk.CURRENT_TIME);
        const offset = location.get_timezone().get_offset(interval) / 3600;
        const offsetString = offset >= 0 ? `+${offset}` : offset;

        const gTimeZone = GLib.TimeZone.new(location.get_timezone_str());
        const localDateTime = GLib.DateTime.new_now(gTimeZone);
        const abbreviation = localDateTime.get_timezone_abbreviation();

        const hasCountry = location.get_country_name();

        const title = hasCountry ? `${location.get_name()}, ${location.get_country_name()}` : location.get_name();

        const timeZoneRow = new Adw.ActionRow({
            title,
            subtitle: `${location.get_timezone_str()} • ${abbreviation} (UTC ${offsetString})`,
            activatable: true,
        });
        timeZoneRow.use_markup = true;
        timeZoneRow.location = location;

        timeZoneRow.connect('activated', () => {
            this.emit('time-zone-changed', location.get_timezone_str(), `${title} • ${abbreviation}`);
            this.close();
        });

        return timeZoneRow;
    }
});
