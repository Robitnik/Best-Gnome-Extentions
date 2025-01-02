import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {SubPage} from './SubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const LabelSubPage = GObject.registerClass(
class AzClockLabelSubPage extends SubPage {
    _init(params) {
        super._init(params);

        this._customGroup = new Adw.PreferencesGroup();
        this.add(this._customGroup);

        const generalGroup = new Adw.PreferencesGroup();
        this.add(generalGroup);

        const textAlignmentXRow = this.createComboRow(_('Alignment X'), 'text-align-x');
        generalGroup.add(textAlignmentXRow);

        const textAlignmentYRow = this.createComboRow(_('Alignment Y'), 'text-align-y');
        generalGroup.add(textAlignmentYRow);

        const lineAlignmentRow = this.createComboRow(_('Line Alignment'), 'line-alignment');
        generalGroup.add(lineAlignmentRow);

        const paddingExpanderRow = this.createPaddingMarginsExpander('padding', _('Padding'));
        generalGroup.add(paddingExpanderRow);

        const marginsExpanderRow = this.createPaddingMarginsExpander('margin', _('Margins'));
        generalGroup.add(marginsExpanderRow);

        const textOptionsGroup = new Adw.PreferencesGroup({
            title: _('Text Style'),
        });
        this.add(textOptionsGroup);

        const [overrideFontFamily, fontFamily] = this.settings.get_value('font-family-override').deepUnpack();
        const fontExpanderRow = new Adw.ExpanderRow({
            title: _('Override Font Family'),
            show_enable_switch: true,
            expanded: overrideFontFamily,
            enable_expansion: overrideFontFamily,
        });
        textOptionsGroup.add(fontExpanderRow);
        fontExpanderRow.connect('notify::enable-expansion', widget => {
            this._setVariantValue('font-family-override', '(bs)', widget.enable_expansion, 0);
        });

        const fontButton = new Gtk.FontDialogButton({
            valign: Gtk.Align.CENTER,
            use_size: false,
            use_font: true,
            level: Gtk.FontLevel.FAMILY,
            font_desc: Pango.font_description_from_string(fontFamily),
            dialog: new Gtk.FontDialog(),
        });
        fontButton.connect('notify::font-desc', widget => {
            const newFontFamily = widget.font_desc.get_family();
            this._setVariantValue('font-family-override', '(bs)', newFontFamily, 1);
        });
        const fontRow = new Adw.ActionRow({
            title: _('Font'),
        });
        fontRow.add_suffix(fontButton);
        fontExpanderRow.add_row(fontRow);
        const fontWeightSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 100, upper: 1000, step_increment: 100, page_increment: 1, page_size: 0,
            }),
            climb_rate: 1,
            numeric: true,
            valign: Gtk.Align.CENTER,
            value: this.settings.get_int('font-weight'),
        });
        fontWeightSpinButton.connect('value-changed', widget => {
            this.settings.set_int('font-weight', widget.get_value());
        });
        const fontWeightRow = new Adw.ActionRow({
            title: _('Font Weight'),
            /** TRANSLATORS: This shows some standard font weight names and how they correlate to a numerical value*/
            subtitle: _('100 = Thin, 400 = Normal, 700 = Bold'),
            activatable_widget: fontWeightSpinButton,
        });
        fontWeightRow.add_suffix(fontWeightSpinButton);
        fontExpanderRow.add_row(fontWeightRow);

        const fontSyle = this.settings.get_enum('font-style');
        const fontSyleStringList = new Gtk.StringList();
        fontSyleStringList.append(_('Normal'));
        fontSyleStringList.append(_('Oblique'));
        fontSyleStringList.append(_('Italic'));

        const fontSyleComboRow = new Adw.ComboRow({
            title: _('Font Style'),
            model: fontSyleStringList,
            selected: fontSyle,
        });
        fontSyleComboRow.connect('notify::selected', widget => {
            this.settings.set_enum('font-style', widget.selected);
        });
        fontExpanderRow.add_row(fontSyleComboRow);

        const fontSizeButton = this.createSpinButton(this.settings.get_int('font-size'), 8, 200);
        fontSizeButton.connect('value-changed', widget => {
            this.settings.set_int('font-size', widget.get_value());
        });
        const fontSizeRow = new Adw.ActionRow({
            title: _('Font Size'),
            activatable_widget: fontSizeButton,
        });
        fontSizeRow.add_suffix(fontSizeButton);
        textOptionsGroup.add(fontSizeRow);

        const textColorButton = this.createColorButton(this.settings.get_string('foreground-color'));
        textColorButton.connect('color-set', widget => {
            this.settings.set_string('foreground-color', widget.get_rgba().to_string());
        });
        const textColorRow = new Adw.ActionRow({
            title: _('Text Color'),
            activatable_widget: textColorButton,
        });
        textColorRow.add_suffix(textColorButton);
        textOptionsGroup.add(textColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Text Shadow'), 'shadow');
        textOptionsGroup.add(shadowExpanderRow);

        const borderOptionsRow = new Adw.ExpanderRow({
            title: _('Enable Border'),
            show_enable_switch: true,
            enable_expansion: this.settings.get_boolean('show-border'),
        });
        generalGroup.add(borderOptionsRow);
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

        const backgroundRow = new Adw.ExpanderRow({
            title: _('Enable Background'),
            show_enable_switch: true,
            enable_expansion: this.settings.get_boolean('show-background'),
        });
        backgroundRow.connect('notify::enable-expansion', widget => {
            this.settings.set_boolean('show-background', widget.enable_expansion);
        });
        generalGroup.add(backgroundRow);

        const backgroundColorButton = this.createColorButton(this.settings.get_string('background-color'));
        backgroundColorButton.connect('color-set', widget => {
            this.settings.set_string('background-color', widget.get_rgba().to_string());
        });
        const backgroundColorRow = new Adw.ActionRow({
            title: _('Background Color'),
            activatable_widget: backgroundColorButton,
        });
        backgroundColorRow.add_suffix(backgroundColorButton);
        backgroundRow.add_row(backgroundColorRow);

        const backgroundRadiusButton = this.createSpinButton(this.settings.get_int('border-radius'), 0, 999);
        backgroundRadiusButton.connect('value-changed', widget => {
            this.settings.set_int('border-radius', widget.get_value());
        });
        const backgroundRadiusRow = new Adw.ActionRow({
            title: _('Background Radius'),
            activatable_widget: backgroundRadiusButton,
        });
        backgroundRadiusRow.add_suffix(backgroundRadiusButton);
        backgroundRow.add_row(backgroundRadiusRow);
    }

    createComboRow(title, setting) {
        const value = this.settings.get_enum(setting) - 1;

        const stringList = new Gtk.StringList();
        stringList.append(_('Start'));
        stringList.append(_('Center'));
        stringList.append(_('End'));

        const comboRow = new Adw.ComboRow({
            title: _(title),
            model: stringList,
            selected: value,
        });
        comboRow.connect('notify::selected', widget => {
            this.settings.set_enum(setting, widget.selected + 1);
        });
        return comboRow;
    }
});
