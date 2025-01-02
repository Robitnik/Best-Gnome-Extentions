import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {LabelSubPage} from './LabelSubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const DigitalClockSubPage = GObject.registerClass(
class AzClockDigitalClockSubPage extends LabelSubPage {
    _init(params) {
        super._init(params);

        const timeZoneRow = this.createTimeZoneRow();
        this._customGroup.add(timeZoneRow);

        const dateFormatExpanderRow = new Adw.ExpanderRow({
            title: _('Date/Time Format'),
            expanded: true,
            enable_expansion: true,
        });

        const dateFormatEntry = new Gtk.Entry({
            valign: Gtk.Align.FILL,
            vexpand: true,
            halign: Gtk.Align.FILL,
            hexpand: true,
            text: this.settings.get_string('date-format'),
        });
        dateFormatEntry.connect('changed', () => {
            this.settings.set_string('date-format', dateFormatEntry.get_text());
        });
        const dateFormatRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });

        const linksBox = new Gtk.Box({
            css_classes: ['linked'],
        });
        const linkButton = new Gtk.LinkButton({
            label: _('Format Guide'),
            uri: 'https://docs.gtk.org/glib/method.DateTime.format.html#description',
            css_classes: ['caption'],
            valign: Gtk.Align.CENTER,
        });
        linksBox.append(linkButton);
        const linkButton2 = new Gtk.LinkButton({
            label: _('Markup Guide'),
            uri: 'https://docs.gtk.org/Pango/pango_markup.html',
            css_classes: ['caption'],
            valign: Gtk.Align.CENTER,
        });
        linksBox.append(linkButton2);

        dateFormatRow.set_child(dateFormatEntry);
        dateFormatExpanderRow.add_action(linksBox);
        dateFormatExpanderRow.add_row(dateFormatRow);
        this._customGroup.add(dateFormatExpanderRow);
    }
});
