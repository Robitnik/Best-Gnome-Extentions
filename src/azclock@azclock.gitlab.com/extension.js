/* eslint-disable jsdoc/require-jsdoc */
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {formatDateWithCFormatString} from 'resource:///org/gnome/shell/misc/dateUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Utils from './utils.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const DEBUG_LOG = false;

const ElementType = {
    DIGITAL_CLOCK: 0,
    ANALOG_CLOCK: 1,
    TEXT_LABEL: 2,
    COMMAND_LABEL: 3,
};

let SETTINGS, EXTENSION;

const AnchorPoint = {
    TOP_LEFT: 0,
    BOTTOM_LEFT: 1,
    TOP_RIGHT: 2,
    BOTTOM_RIGHT: 3,
    CENTER: 4,
};

function debugLog(msg) {
    if (DEBUG_LOG)
        console.log(msg);
}

function fontStyleEnumToString(enumValue) {
    switch (enumValue) {
    case Pango.Style.NORMAL:
        return null;
    case Pango.Style.OBLIQUE:
        return 'oblique';
    case Pango.Style.ITALIC:
        return 'italic';
    default:
        return null;
    }
}

function getClockDate(settings, origDate) {
    const [overrideTimeZone, timeZone] = settings.get_value('timezone-override').deepUnpack();

    if (overrideTimeZone) {
        const gTimeZone = GLib.TimeZone.new(timeZone);
        const localDateTime = GLib.DateTime.new_now(gTimeZone);

        const year = localDateTime.get_year();
        const monthIndex = localDateTime.get_month() - 1;
        const day = localDateTime.get_day_of_month();
        const hours = localDateTime.get_hour();
        const minutes = localDateTime.get_minute();
        const seconds = localDateTime.get_second();

        const newDate = new Date(year, monthIndex, day, hours, minutes, seconds);

        return newDate;
    } else {
        return origDate;
    }
}

var DesktopWidget = GObject.registerClass(
class AzClockDesktopWidget extends St.Widget {
    _init(settings, settingsId) {
        super._init({
            layout_manager: new Clutter.BoxLayout(),
            reactive: true,
            track_hover: true,
            can_focus: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
        });

        this._settings = settings;
        this._settingsId = settingsId;

        this._elements = new Map();
        this._oldElementIds = [];

        const isVertical = this._settings.get_boolean('vertical');
        this.layout_manager.orientation = isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this.connect('notify::hover', () => this._onHover());
        this.connect('destroy', () => this._onDestroy());

        this._settings.connectObject('changed', () => {
            this._setParent();
            this._updateDnD();
            this.createElements();
            this.setStyle();
            this.setPositionFromSettings();
        }, this);
        this._setParent();

        this.makeDraggable();
        this._updateDnD();

        this.createElements();
        this.setStyle();
        this.setPositionFromSettings();
        this.updateClocks(true);
    }

    _updateDnD() {
        // If the widget is locked, block draggable _grabActor()
        if (!this._settings.get_boolean('lock-widget'))
            this._draggable._grabActor = this._dragGrabActor;
        else
            this._draggable._grabActor = () => {};
    }

    _setParent() {
        const parent = this.get_parent();
        if (parent === Main.layoutManager.uiGroup)
            Main.layoutManager.removeChrome(this);
        else if (parent === Main.layoutManager._backgroundGroup)
            Main.layoutManager._backgroundGroup.remove_child(this);

        const alwaysOnTop = this._settings.get_boolean('always-on-top');
        if (alwaysOnTop)
            Main.layoutManager.addTopChrome(this);
        else
            Main.layoutManager._backgroundGroup.add_child(this);
    }

    vfunc_allocate(box) {
        if (this._isDragging) {
            super.vfunc_allocate(box);
            return;
        }

        const [x, y] = this._settings.get_value('location').deepUnpack();

        const width = box.get_width();
        const height = box.get_height();
        const xAnchorRight = x - width;
        const yAnchorBottom = y - height;
        const xAnchorCenter = x - (width / 2);
        const yAnchorCenter = y - (height / 2);

        const anchorPoint = this._settings.get_enum('anchor-point');
        if (anchorPoint === AnchorPoint.TOP_LEFT)
            box.set_origin(x, y);
        else if (anchorPoint === AnchorPoint.BOTTOM_LEFT)
            box.set_origin(x, yAnchorBottom);
        else if (anchorPoint === AnchorPoint.TOP_RIGHT)
            box.set_origin(xAnchorRight, y);
        else if (anchorPoint === AnchorPoint.BOTTOM_RIGHT)
            box.set_origin(xAnchorRight, yAnchorBottom);
        else if (anchorPoint === AnchorPoint.CENTER)
            box.set_origin(xAnchorCenter, yAnchorCenter);

        super.vfunc_allocate(box);
    }

    createElements() {
        this.remove_all_children();

        const elementIds = [];
        const elements = this._settings.get_value('elements').recursiveUnpack();
        elements.forEach(element => {
            for (const [elementId, properties] of Object.entries(element)) {
                if (properties.enabled)
                    elementIds.push(elementId);
            }
        });

        const deletedElement = this._oldElementIds.filter(x => !elementIds.includes(x));

        for (let i = 0; i < deletedElement.length; i++) {
            const elementId = deletedElement[i];
            const element = this._elements.get(elementId);
            if (element) {
                element.destroy();
                this._elements.delete(elementId);
            }
        }

        for (let i = 0; i < elementIds.length; i++) {
            const elementId = elementIds[i];
            const elementSchema = `${SETTINGS.schema_id}.element-data`;
            const elementPath = `${this._settings.path}element-data/${elementId}/`;
            const elementSettings = Utils.getSettings(EXTENSION, elementSchema, elementPath);

            let element = this._elements.get(elementId);
            if (!element) {
                const elementType = elementSettings.get_enum('element-type');
                let elementConstructor;
                if (elementType === ElementType.DIGITAL_CLOCK)
                    elementConstructor = DigitalClock;
                else if (elementType === ElementType.ANALOG_CLOCK)
                    elementConstructor = AnalogClock;
                else if (elementType === ElementType.TEXT_LABEL)
                    elementConstructor = TextLabel;
                else if (elementType === ElementType.COMMAND_LABEL)
                    elementConstructor = CommandLabel;

                element = new elementConstructor(elementSettings);
                this._elements.set(elementId, element);
            }
            this.add_child(element);
        }

        this._oldElementIds = elementIds;
        this.queue_relayout();
    }

    updateClocks(immediate = false) {
        this._elements.forEach(element => {
            if (element instanceof DigitalClock || element instanceof AnalogClock)
                element.updateClock(immediate);
        });

        this.queue_relayout();
    }

    setPositionFromSettings() {
        const [x, y] = this._settings.get_value('location').deepUnpack();
        debugLog(`set pos from settings - (${x}, ${y})`);
        this.set_position(x, y);
        this.queue_relayout();
    }

    setStyle() {
        const isVertical = this._settings.get_boolean('vertical');
        this.layout_manager.orientation = isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        const showBorder = this._settings.get_boolean('show-border');
        const borderColor = this._settings.get_string('border-color');
        const borderWidth = this._settings.get_int('border-width');
        const borderRadius = this._settings.get_int('border-radius');

        const showBackground = this._settings.get_boolean('show-background');
        const backgroundColor = this._settings.get_string('background-color');

        const spacing = this._settings.get_int('spacing');
        const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this._settings.get_value('padding').deepUnpack();

        this.layoutManager.spacing = spacing;

        let style = `padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;`;

        if (showBackground) {
            style += `background-color: ${backgroundColor};
                      border-radius: ${borderRadius}px;`;
        }

        if (showBorder) {
            style += `border-width: ${borderWidth}px;
                      border-color: ${borderColor};`;
        }

        this.style = style;

        this.queue_relayout();
    }

    vfunc_button_press_event() {
        const event = Clutter.get_current_event();

        if (event.get_button() === 1) {
            this._setPopupTimeout();
        } else if (event.get_button() === 3) {
            this._popupMenu();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event() {
        this._removeMenuTimeout();
        return Clutter.EVENT_PROPAGATE;
    }

    _onDragBegin() {
        if (this._menu)
            this._menu.close(true);
        this._removeMenuTimeout();

        this._isDragging = true;
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this._dragX = this.x;
        this._dragY = this.y;
    }

    _onDragMotion(dragEvent) {
        this.deltaX = dragEvent.x - (dragEvent.x - this._dragX);
        this.deltaY = dragEvent.y - (dragEvent.y - this._dragY);

        const [x, y] = this.allocation.get_origin();
        this._dragX = x;
        this._dragY = y;

        return DND.DragMotionResult.CONTINUE;
    }

    _onDragEnd() {
        this._isDragging = false;
        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }

        let [x, y] = [Math.round(this.deltaX), Math.round(this.deltaY)];
        const width = this.get_width();
        const height = this.get_height();
        const newX = x + width;
        const newY = y + height;
        const centerX = x + (width / 2);
        const centerY = y + (height / 2);

        const anchorPoint = this._settings.get_enum('anchor-point');
        if (anchorPoint === AnchorPoint.BOTTOM_LEFT) {
            y = newY;
        } else if (anchorPoint === AnchorPoint.TOP_RIGHT) {
            x = newX;
        } else if (anchorPoint === AnchorPoint.BOTTOM_RIGHT) {
            x = newX;
            y = newY;
        } else if (anchorPoint === AnchorPoint.CENTER) {
            x = centerX;
            y = centerY;
        }

        this._settings.set_value('location', new GLib.Variant('(ii)', [x, y]));
        debugLog(`drag end - (${x}, ${y})`);
    }

    getDragActorSource() {
        return this;
    }

    makeDraggable() {
        this._draggable = DND.makeDraggable(this);
        this._draggable._dragActorDropped = () => {
            this._draggable._animationInProgress = true;
            this._draggable._dragCancellable = false;
            this._draggable._dragState = 0; // DND.DragState.INIT;
            this._draggable._onAnimationComplete(this._draggable._dragActor, Clutter.get_current_event().get_time());
            return true;
        };

        this._dragGrabActor = this._draggable._grabActor;

        this.dragBeginId = this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this.dragEndId = this._draggable.connect('drag-end', this._onDragEnd.bind(this));
    }

    _onHover() {
        if (!this.hover)
            this._removeMenuTimeout();
    }

    _removeMenuTimeout() {
        if (this._menuTimeoutId > 0) {
            GLib.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    }

    _setPopupTimeout() {
        this._removeMenuTimeout();
        this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            this._menuTimeoutId = 0;
            this._popupMenu();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._menuTimeoutId, '[azclock] this.popupMenu');
    }

    _popupMenu() {
        this._removeMenuTimeout();

        if (!this._menu) {
            this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);

            const lockWidget = this._settings.get_boolean('lock-widget');
            const lockPositionSwitch = new PopupMenu.PopupSwitchMenuItem(_('Lock Position'), lockWidget);
            this._menu.addMenuItem(lockPositionSwitch);
            lockPositionSwitch.connect('toggled', (_self, toggled) => {
                this._menu.close();

                this._settings.set_boolean('lock-widget', toggled);
            });

            const alwaysOnTop = this._settings.get_boolean('always-on-top');
            const alwaysOnTopSwitch = new PopupMenu.PopupSwitchMenuItem(_('Always on Top'), alwaysOnTop);
            this._menu.addMenuItem(alwaysOnTopSwitch);
            alwaysOnTopSwitch.connect('toggled', (_self, toggled) => {
                this._menu.close();

                this._settings.set_boolean('always-on-top', toggled);
            });

            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._menu.addAction(_('Desktop Clock Settings'), () => {
                EXTENSION.openPreferences();
            });

            Main.uiGroup.add_child(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }

        this._menu.open();
        return false;
    }

    _disconnectDnD() {
        if (this._draggable && this.dragBeginId) {
            this._draggable.disconnect(this.dragBeginId);
            this.dragBeginId = null;
        }

        if (this._draggable && this.dragEndId) {
            this._draggable.disconnect(this.dragEndId);
            this.dragEndId = null;
        }

        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }
    }

    _onDestroy() {
        this._removeMenuTimeout();

        if (this._updateClockId) {
            GLib.source_remove(this._updateClockId);
            this._updateClockId = null;
        }

        this._disconnectDnD();
    }
});

var AnalogClock = GObject.registerClass(
class AzClockAnalogClock extends Clutter.Actor {
    _init(settings) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this._settings = settings;

        this._clockFace = new St.Icon({
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: this._settings.get_boolean('clock-face-visible'),
        });

        this._secondHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
            visible: this._settings.get_boolean('second-hand-visible'),
        });

        this._minuteHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_align: Clutter.ActorAlign.START,
        });

        this._hourHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_align: Clutter.ActorAlign.START,
        });

        this._clockButton = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: this._settings.get_boolean('clock-button-visible'),
        });

        if (this.add_actor) {
            this.add_actor(this._clockFace);
            this.add_actor(this._hourHand);
            this.add_actor(this._minuteHand);
            this.add_actor(this._secondHand);
            this.add_actor(this._clockButton);
        } else {
            this.add_child(this._clockFace);
            this.add_child(this._hourHand);
            this.add_child(this._minuteHand);
            this.add_child(this._secondHand);
            this.add_child(this._clockButton);
        }

        this._settings.connectObject('changed', () => this.setStyle(), this);
        this.setStyle();

        this.connect('destroy', () => this._settings.disconnectObject(this));
    }

    setAnalogClockStyle(actor, namePrefix) {
        const directoryName = 'analog-clock-components';
        const filePath = `${EXTENSION.path}/media/${directoryName}/`;

        actor.style = this.getStyle(namePrefix);

        if (namePrefix === 'clock-face' || namePrefix === 'second-hand' || namePrefix === 'clock-button')
            actor.visible = this._settings.get_boolean(`${namePrefix}-visible`);

        const iconStyle = this._settings.get_int(`${namePrefix}-style`);
        actor.gicon = Gio.icon_new_for_string(`${filePath}/${namePrefix}-${iconStyle}-symbolic.svg`);

        actor.icon_size = this._settings.get_int('clock-size');
    }

    getStyle(namePrefix) {
        let color, shadow, backgroundColor, showBorder, borderWidth, borderColor, borderRadius, boxShadow;

        if (namePrefix === 'clock-face') {
            color = this._settings.get_string('foreground-color');
            backgroundColor = this._settings.get_string('background-color');
            borderRadius = this._settings.get_int('border-radius');
            borderWidth = this._settings.get_int('border-width');
            borderColor = this._settings.get_string('border-color');
            showBorder = this._settings.get_boolean('show-border');
            shadow = this._settings.get_value('shadow').deepUnpack();
            boxShadow = this._settings.get_value('clock-face-shadow').deepUnpack();
        } else {
            color = this._settings.get_string(`${namePrefix}-color`);
            shadow = this._settings.get_value(`${namePrefix}-shadow`).deepUnpack();
        }

        let style = `color: ${color};`;

        if (backgroundColor)
            style += `background-color: ${backgroundColor};`;
        if (borderRadius)
            style += `border-radius: ${borderRadius}px;`;

        if (showBorder) {
            if (borderWidth)
                style += `border: ${borderWidth}px;`;
            if (borderColor)
                style += `border-color: ${borderColor};`;
        }

        let [shadowEnabled, shadowColor, shadowX, shadowY,
            shadowSpread, shadowBlur] = shadow;

        if (shadowEnabled)
            style += `icon-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;

        if (boxShadow) {
            [shadowEnabled, shadowColor, shadowX, shadowY,
                shadowSpread, shadowBlur] = boxShadow;

            if (shadowEnabled)
                style += `box-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;
        }

        return style;
    }

    setStyle() {
        this.setAnalogClockStyle(this._clockFace, 'clock-face');
        this.setAnalogClockStyle(this._secondHand, 'second-hand');
        this.setAnalogClockStyle(this._minuteHand, 'minute-hand');
        this.setAnalogClockStyle(this._hourHand, 'hour-hand');
        this.setAnalogClockStyle(this._clockButton, 'clock-button');
    }

    updateClock(immediate = false) {
        const date = new Date();

        const elementDate = getClockDate(this._settings, date);
        this.tickClock(elementDate, immediate);

        this.queue_relayout();
    }

    tickClock(date, immediate) {
        // Keep hours in 12 hour format for analog clock
        if (date.getHours() >= 12)
            date.setHours(date.getHours() - 12);

        const degrees = 6; // each minute and second tick represents a 6 degree increment.
        const secondsInDegrees = date.getSeconds() * degrees;
        const minutesInDegrees = date.getMinutes() * degrees;
        const hoursInDegrees = date.getHours() * 30;

        if (this._secondHand.visible)
            this.tickClockHand(this._secondHand, secondsInDegrees, immediate);

        const adjustMinutesWithSeconds = this._settings.get_boolean('minute-hand-adjust-with-seconds');
        const minutesRotationDegree = adjustMinutesWithSeconds ? minutesInDegrees + secondsInDegrees / 60 : minutesInDegrees;
        this.tickClockHand(this._minuteHand, minutesRotationDegree, immediate);
        this.tickClockHand(this._hourHand, hoursInDegrees + minutesInDegrees / 12, immediate);
    }

    tickClockHand(hand, rotationDegree, immediate) {
        const smoothTicks = this._settings.get_boolean('smooth-hand-ticks');
        // eslint-disable-next-line no-nested-ternary
        const duration = immediate ? 0 : smoothTicks ? 1000 : 300;
        hand.remove_all_transitions();

        // The onComplete() of the hand.ease() might not trigger when removing the transition.
        if (hand.checkRotationDegree) {
            hand.checkRotationDegree = false;
            if (hand.rotation_angle_z !== 0)
                hand.rotation_angle_z = 0;
        }

        if (rotationDegree === hand.rotation_angle_z)
            return;

        // Prevents the clock hand from spinning counter clockwise back to 0.
        if (rotationDegree === 0 && hand.rotation_angle_z !== 0) {
            rotationDegree = 360;
            hand.checkRotationDegree = true;
        }


        hand.ease({
            opacity: 255, // onComplete() seems to trigger instantly without this.
            rotation_angle_z: rotationDegree,
            mode: smoothTicks ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_QUAD,
            duration,
            onComplete: () => {
                // Prevents the clock hand from spinning counter clockwise back to 0.
                if (rotationDegree === 360)
                    hand.rotation_angle_z = 0;
            },
        });
    }
});

var Label = GObject.registerClass(
class AzClockLabel extends St.Label {
    _init(settings) {
        super._init({
            y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });

        this._settings = settings;

        this.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.NONE,
        });

        this._settings.connectObject('changed', () => this.setStyle(), this);
        this.setStyle();

        this.connect('destroy', () => this._onDestroy());
    }

    setStyle() {
        const [shadowEnabled, shadowColor, shadowX, shadowY,
            shadowSpread, shadowBlur] = this._settings.get_value('shadow').deepUnpack();

        const [customFontEnabled, customFontFamily] = this._settings.get_value('font-family-override').deepUnpack();

        const textColor = this._settings.get_string('foreground-color');
        const textSize = this._settings.get_int('font-size');

        const textAlignmentX = this._settings.get_enum('text-align-x');
        const textAlignmentY = this._settings.get_enum('text-align-y');
        const lineAlignmentEnum = this._settings.get_enum('line-alignment');

        let textLineAlignment = 'left';
        if (lineAlignmentEnum === Clutter.ActorAlign.START)
            textLineAlignment = 'left';
        else if (lineAlignmentEnum === Clutter.ActorAlign.CENTER)
            textLineAlignment =  'center';
        else if (lineAlignmentEnum === Clutter.ActorAlign.END)
            textLineAlignment =   'right';

        const [marginTop, marginRight, marginBottom, marginLeft] = this._settings.get_value('margin').deepUnpack();
        const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this._settings.get_value('padding').deepUnpack();

        const showBorder = this._settings.get_boolean('show-border');
        const borderColor = this._settings.get_string('border-color');
        const borderWidth = this._settings.get_int('border-width');
        const borderRadius = this._settings.get_int('border-radius');

        const showBackground = this._settings.get_boolean('show-background');
        const backgroundColor = this._settings.get_string('background-color');

        const margin = `margin: ${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px;`;
        const padding = `padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;`;

        let textStyle = `color: ${textColor}; ${margin} ${padding}`;

        if (showBackground) {
            textStyle += `background-color: ${backgroundColor};
                            border-radius: ${borderRadius}px;`;
        }

        if (showBorder) {
            textStyle += `border-width: ${borderWidth}px;
                            border-color: ${borderColor};`;
        }

        if (shadowEnabled)
            textStyle += `text-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;

        if (customFontEnabled) {
            const fontStyleEnum = this._settings.get_enum('font-style');
            const fontStyle = fontStyleEnumToString(fontStyleEnum);
            const fontWeight = this._settings.get_int('font-weight');

            textStyle += `font-family: "${customFontFamily}";`;

            if (fontWeight)
                textStyle += `font-weight: ${fontWeight};`;
            if (fontStyle)
                textStyle += `font-style: ${fontStyle};`;
        }

        if (textLineAlignment)
            textStyle += `text-align: ${textLineAlignment};`;

        this.style = `${textStyle} font-size: ${textSize}pt; font-feature-settings: "tnum";`;

        this.x_align = textAlignmentX;
        this.y_align = textAlignmentY;
        this.queue_relayout();
    }

    _onDestroy() {
        this._settings.disconnectObject(this);
    }
});

var DigitalClock = GObject.registerClass(
class AzClockDigitalClock extends Label {
    setStyle() {
        super.setStyle();
        const dateFormat = this._settings.get_string('date-format');
        this._dateFormat = dateFormat;
    }

    updateClock() {
        const date = new Date();

        const dateFormat = this._dateFormat;
        const elementDate = getClockDate(this._settings, date);

        if (dateFormat) {
            this.text = formatDateWithCFormatString(elementDate, dateFormat);
            this.clutter_text.set_markup(this.text);
        }

        this.queue_relayout();
    }
});

var TextLabel = GObject.registerClass(
class AzClockTextLabel extends Label {
    setStyle() {
        super.setStyle();
        const text = this._settings.get_string('text');
        this.text = text;
        this.clutter_text.set_markup(this.text);
        this.queue_relayout();
    }
});

var CommandLabel = GObject.registerClass(
class AzClockCommandLabel extends Label {
    _init(settings) {
        super._init(settings);
        this._settings.connectObject('changed::command', () => this.refreshCommand(), this);
        this.refreshCommand();
    }

    _setErrorState() {
        this._removePollingInterval();
        this.text = _('error');
        this.clutter_text.set_markup(this.text);
    }

    refreshCommand() {
        this._removePollingInterval();
        this._executeCommand();
        this._startPollingInterval();
    }

    _startPollingInterval() {
        const pollingInterval = this._settings.get_int('polling-interval');
        const interval = Math.max(pollingInterval, 250);
        this._pollingIntervalId = GLib.timeout_add(GLib.PRIORITY_HIGH, interval, () => {
            this._executeCommand();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _removePollingInterval() {
        if (this._pollingIntervalId) {
            GLib.source_remove(this._pollingIntervalId);
            this._pollingIntervalId = null;
        }
    }

    _executeCommand() {
        const command = this._settings.get_string('command');
        this._execCommand(command).then(() => this.queue_relayout());
    }

    async _execCommand(command, input = null, cancellable = null) {
        if (!command || command.length === 0) {
            this._setErrorState();
            console.log('Desktop Clock - Error executing command. No command detected.');
            return;
        }
        try {
            const argv = ['bash', '-c', command];

            let flags = Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE;

            if (input !== null)
                flags |= Gio.SubprocessFlags.STDIN_PIPE;

            const proc = Gio.Subprocess.new(argv, flags);

            const [stdout, stderr] = await proc.communicate_utf8_async(input, cancellable);

            if (!proc.get_successful() || stderr) {
                this._setErrorState();
                const status = proc.get_exit_status();
                console.log(`Desktop Clock - Error executing command "${command}": ${stderr ? stderr.trim() : GLib.strerror(status)}`);
                return;
            }

            const response = stdout.trim();

            if (!response) {
                this._setErrorState();
                console.log(`Desktop Clock - Error executing command "${command}": no output.`);
                return;
            }

            this.text = response;
            this.clutter_text.set_markup(this.text);
        } catch (err) {
            this._setErrorState();
            console.log(`Desktop Clock - Error executing command "${command}": ${err}`);
        }
    }

    _onDestroy() {
        this._removePollingInterval();
        super._onDestroy();
    }
});

export default class AzClock extends Extension {
    enable() {
        EXTENSION = this;
        SETTINGS = this.getSettings();

        Utils.convertOldSettings(EXTENSION, SETTINGS);
        Utils.createInitialWidget(EXTENSION, SETTINGS);
        Utils.removeEmptyWidgetData(EXTENSION, SETTINGS);

        this.widgets = new Map();
        this._oldWidgetIds = [];

        this._createWidgets();
        this._startClockTimer();

        SETTINGS.connectObject('changed::widgets', () => this._createWidgets(), this);
    }

    disable() {
        SETTINGS.disconnectObject(this);

        if (this._dataChangedTimeoutId) {
            GLib.source_remove(this._dataChangedTimeoutId);
            this._dataChangedTimeoutId = null;
        }

        this._removeClockTimer();
        this._destroyWidgets();

        SETTINGS.disconnectObject(this);
        EXTENSION = null;
        SETTINGS = null;
    }

    _startClockTimer() {
        this._updateClockId = GLib.timeout_add(GLib.PRIORITY_HIGH, 1000, () => {
            this.widgets.forEach(widget => {
                widget.updateClocks();
            });

            return GLib.SOURCE_CONTINUE;
        });
    }

    _removeClockTimer() {
        if (this._updateClockId) {
            GLib.source_remove(this._updateClockId);
            this._updateClockId = null;
        }
    }

    _destroyWidgets() {
        this.widgets.forEach(widget => {
            widget.destroy();
        });

        this.widgets = null;
    }

    _createWidget(widgetId) {
        const widgetSchema = `${SETTINGS.schema_id}.widget-data`;
        const widgetPath = `${SETTINGS.path}widget-data/${widgetId}/`;
        const widgetSettings = Utils.getSettings(EXTENSION, widgetSchema, widgetPath);

        const widget = new DesktopWidget(widgetSettings, widgetId);
        return widget;
    }

    _createWidgets() {
        const widgetIds = [];
        const widgets = SETTINGS.get_value('widgets').recursiveUnpack();
        widgets.forEach(widget => {
            for (const [widgetId, properties] of Object.entries(widget)) {
                if (properties.enabled)
                    widgetIds.push(widgetId);
            }
        });

        const deletedWidgets = this._oldWidgetIds.filter(x => !widgetIds.includes(x));

        for (let i = 0; i < deletedWidgets.length; i++) {
            const widgetId = deletedWidgets[i];
            const widget = this.widgets.get(widgetId);
            if (widget) {
                widget.destroy();
                this.widgets.delete(widgetId);
            }
        }

        for (let i = 0; i < widgetIds.length; i++) {
            const widgetId = widgetIds[i];
            let widget = this.widgets.get(widgetId);
            if (!widget) {
                widget = this._createWidget(widgetId);
                this.widgets.set(widgetId, widget);
            }
            widget.z_position = widgetIds.length - i;
        }

        this._oldWidgetIds = widgetIds;
    }
}
