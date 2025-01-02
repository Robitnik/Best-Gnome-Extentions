import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {LabelSubPage} from './LabelSubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const CommandLabelSubPage = GObject.registerClass(
class AzClockCommandLabelSubPage extends LabelSubPage {
    _init(params) {
        super._init(params);

        const commandExpanderRow = new Adw.ExpanderRow({
            title: _('Command'),
            expanded: true,
            enable_expansion: true,
        });

        const commandEntry = new Gtk.Entry({
            valign: Gtk.Align.FILL,
            vexpand: true,
            halign: Gtk.Align.FILL,
            hexpand: true,
            text: this.settings.get_string('command') || '',
        });
        commandEntry.connect('changed', () => {
            this.settings.set_string('command', commandEntry.get_text());
        });
        const commandRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });
        commandRow.set_child(commandEntry);
        commandExpanderRow.add_row(commandRow);
        this._customGroup.add(commandExpanderRow);

        const pollingIntervalButton = this.createSpinButton(this.settings.get_int('polling-interval'), 250, 2000000);
        pollingIntervalButton.connect('value-changed', widget => {
            this.settings.set_int('polling-interval', widget.get_value());
        });
        const pollingIntervalRow = new Adw.ActionRow({
            title: _('Polling Interval (ms)'),
            activatable_widget: pollingIntervalButton,
        });
        pollingIntervalRow.add_suffix(pollingIntervalButton);
        this._customGroup.add(pollingIntervalRow);
    }
});
