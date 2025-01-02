import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {LabelSubPage} from './LabelSubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const TextLabelSubPage = GObject.registerClass(
class AzClockTextLabelSubPage extends LabelSubPage {
    _init(params) {
        super._init(params);

        const textExpanderRow = new Adw.ExpanderRow({
            title: _('Text'),
            expanded: true,
            enable_expansion: true,
        });

        const textEntry = new Gtk.Entry({
            valign: Gtk.Align.FILL,
            vexpand: true,
            halign: Gtk.Align.FILL,
            hexpand: true,
            text: this.settings.get_string('text'),
        });
        textEntry.connect('changed', () => {
            this.settings.set_string('text', textEntry.get_text());
        });
        const textRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });

        textRow.set_child(textEntry);
        textExpanderRow.add_row(textRow);
        this._customGroup.add(textExpanderRow);
    }
});
