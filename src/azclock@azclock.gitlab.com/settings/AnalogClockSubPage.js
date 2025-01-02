import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {SubPage} from './SubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CLOCK_STYLE_COUNT = 9;
const BUTTON_STYLE_COUNT = 5;

export const AnalogClockSubPage = GObject.registerClass(
class AzClockAnalogClockSubPage extends SubPage {
    _init(params) {
        super._init(params);

        const timeZoneGroup = new Adw.PreferencesGroup();
        this.add(timeZoneGroup);

        const timeZoneRow = this.createTimeZoneRow();
        timeZoneGroup.add(timeZoneRow);

        const generalGroup = new Adw.PreferencesGroup({
            title: _('Clock Settings'),
        });
        this.add(generalGroup);

        const clockSizeButton = this.createSpinButton(this.settings.get_int('clock-size'), 100, 1000);
        clockSizeButton.connect('value-changed', widget => {
            this.settings.set_int('clock-size', widget.get_value());
        });
        const clockSizeRow = new Adw.ActionRow({
            title: _('Clock Size'),
            activatable_widget: clockSizeButton,
        });
        clockSizeRow.add_suffix(clockSizeButton);
        generalGroup.add(clockSizeRow);

        const marginsExpanderRow = this.createPaddingMarginsExpander('margin', _('Margins'));
        generalGroup.add(marginsExpanderRow);

        const smoothTicksSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this.settings.get_boolean('smooth-hand-ticks'),
        });
        const smoothTicksRow = new Adw.ActionRow({
            title: _('Smooth Hand Ticks'),
            activatable_widget: smoothTicksSwitch,
        });
        smoothTicksSwitch.connect('notify::active', widget => {
            this.settings.set_boolean('smooth-hand-ticks', widget.get_active());
        });
        smoothTicksRow.add_suffix(smoothTicksSwitch);
        generalGroup.add(smoothTicksRow);

        const clockFaceGroup = new Adw.PreferencesGroup({
            title: _('Clock Face'),
        });
        this.add(clockFaceGroup);

        const clockStyleButton = this.createSpinButton(this.settings.get_int('clock-face-style'), 1, CLOCK_STYLE_COUNT);
        clockStyleButton.connect('value-changed', widget => {
            this.settings.set_int('clock-face-style', widget.get_value());
        });
        const clockStyleRow = new Adw.ActionRow({
            title: _('Clock Style'),
            activatable_widget: clockStyleButton,
        });
        clockStyleRow.add_suffix(clockStyleButton);
        clockFaceGroup.add(clockStyleRow);

        const colorButton = this.createColorButton(this.settings.get_string('foreground-color'));
        colorButton.connect('color-set', widget => {
            this.settings.set_string('foreground-color', widget.get_rgba().to_string());
        });
        const colorRow = new Adw.ActionRow({
            title: _('Color'),
            activatable_widget: colorButton,
        });
        colorRow.add_suffix(colorButton);
        clockFaceGroup.add(colorRow);

        const backgroundColorButton = this.createColorButton(this.settings.get_string('background-color'));
        backgroundColorButton.connect('color-set', widget => {
            this.settings.set_string('background-color', widget.get_rgba().to_string());
        });
        const backgroundColorRow = new Adw.ActionRow({
            title: _('Background Color'),
            activatable_widget: backgroundColorButton,
        });
        backgroundColorRow.add_suffix(backgroundColorButton);
        clockFaceGroup.add(backgroundColorRow);

        const borderOptionsRow = new Adw.ExpanderRow({
            title: _('Enable Border'),
            show_enable_switch: true,
            enable_expansion: this.settings.get_boolean('show-border'),
        });
        clockFaceGroup.add(borderOptionsRow);
        borderOptionsRow.connect('notify::enable-expansion', widget => {
            this.settings.set_boolean('show-border', widget.enable_expansion);
        });

        const borderWidthButton = this.createSpinButton(this.settings.get_int('border-width'), 0, 15);
        borderWidthButton.connect('value-changed', widget => {
            this.settings.set_int('border-width', widget.get_value());
        });
        const borderWidthRow = new Adw.ActionRow({
            title: _('Border Width'),
            activatable_widget: borderWidthButton,
        });
        borderWidthRow.add_suffix(borderWidthButton);
        borderOptionsRow.add_row(borderWidthRow);

        const borderColorButton = this.createColorButton(this.settings.get_string('border-color'));
        borderColorButton.connect('color-set', widget => {
            this.settings.set_string('border-color', widget.get_rgba().to_string());
        });
        const borderColorRow = new Adw.ActionRow({
            title: _('Border Color'),
            activatable_widget: borderColorButton,
        });
        borderColorRow.add_suffix(borderColorButton);
        borderOptionsRow.add_row(borderColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Inner Shadow'), 'shadow');
        clockFaceGroup.add(shadowExpanderRow);

        const shadowOuterExpanderRow = this.createShadowExpanderRow(_('Outer Shadow'), 'clock-face-shadow');
        clockFaceGroup.add(shadowOuterExpanderRow);

        const enableSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this.settings.get_boolean('clock-face-visible'),
        });
        enableSwitch.connect('notify::active', widget => {
            this.settings.set_boolean('clock-face-visible', widget.get_active());

            clockStyleRow.sensitive = widget.get_active();
            colorRow.sensitive = widget.get_active();
            backgroundColorRow.sensitive = widget.get_active();
            borderOptionsRow.sensitive = widget.get_active();
            shadowExpanderRow.sensitive = widget.get_active();
            shadowOuterExpanderRow.sensitive = widget.get_active();
        });
        clockFaceGroup.set_header_suffix(enableSwitch);

        clockStyleRow.sensitive = enableSwitch.get_active();
        colorRow.sensitive = enableSwitch.get_active();
        backgroundColorRow.sensitive = enableSwitch.get_active();
        borderOptionsRow.sensitive = enableSwitch.get_active();
        shadowExpanderRow.sensitive = enableSwitch.get_active();
        shadowOuterExpanderRow.sensitive = enableSwitch.get_active();

        this.createHandGroup('clock-button', _('Button in Center'), BUTTON_STYLE_COUNT);
        this.createHandGroup('second-hand', _('Second Hand'), CLOCK_STYLE_COUNT);
        this.createHandGroup('minute-hand', _('Minute Hand'), CLOCK_STYLE_COUNT);
        this.createHandGroup('hour-hand', _('Hour Hand'), CLOCK_STYLE_COUNT);
    }

    createHandGroup(settingPrefix, title, maxStyles) {
        const handGroup = new Adw.PreferencesGroup({
            title: _(title),
        });
        this.add(handGroup);

        const styleButton = this.createSpinButton(this.settings.get_int(`${settingPrefix}-style`), 1, maxStyles);
        styleButton.connect('value-changed', widget => {
            this.settings.set_int(`${settingPrefix}-style`, widget.get_value());
        });
        const styleRow = new Adw.ActionRow({
            title: _('Clock Style'),
            activatable_widget: styleButton,
        });
        styleRow.add_suffix(styleButton);
        handGroup.add(styleRow);

        const handColorButton = this.createColorButton(this.settings.get_string(`${settingPrefix}-color`));
        handColorButton.connect('color-set', widget => {
            this.settings.set_string(`${settingPrefix}-color`, widget.get_rgba().to_string());
        });
        const handColorRow = new Adw.ActionRow({
            title: _('Color'),
            activatable_widget: handColorButton,
        });
        handColorRow.add_suffix(handColorButton);
        handGroup.add(handColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Shadow'), `${settingPrefix}-shadow`);
        handGroup.add(shadowExpanderRow);

        if (settingPrefix === 'second-hand' || settingPrefix === 'clock-button') {
            const enableSwitch = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                active: this.settings.get_boolean(`${settingPrefix}-visible`),
            });
            enableSwitch.connect('notify::active', widget => {
                this.settings.set_boolean(`${settingPrefix}-visible`, widget.get_active());

                styleRow.sensitive = widget.get_active();
                shadowExpanderRow.sensitive = widget.get_active();
                handColorRow.sensitive = widget.get_active();
            });
            handGroup.set_header_suffix(enableSwitch);

            styleRow.sensitive = enableSwitch.get_active();
            shadowExpanderRow.sensitive = enableSwitch.get_active();
            handColorRow.sensitive = enableSwitch.get_active();
        }
        if (settingPrefix === 'minute-hand') {
            const adjustWithSecondsSwitch = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                active: this.settings.get_boolean('minute-hand-adjust-with-seconds'),
            });
            const adjustWithSecondsRow = new Adw.ActionRow({
                title: _('Move Minute Hand with each Second'),
                activatable_widget: adjustWithSecondsSwitch,
            });
            adjustWithSecondsSwitch.connect('notify::active', widget => {
                this.settings.set_boolean('minute-hand-adjust-with-seconds', widget.get_active());
            });
            adjustWithSecondsRow.add_suffix(adjustWithSecondsSwitch);
            handGroup.add(adjustWithSecondsRow);
        }
    }
});
