# Best-Gnome-Extentions
Best extentions for Gnome 45,46,47

### Auto Install
./extentions/install.sh



---

# GNOME Extensions Installer

This repository contains several GNOME Shell extensions, along with a script to automate the installation process. Each folder represents a GNOME Shell extension, and the `install.sh` script moves these extensions into the appropriate directory for GNOME to recognize and use them.

---

## Contents

The repository includes the following:

- **Extension Folders**: Each folder represents a GNOME extension, such as:

1. `azclock@azclock.gitlab.com`
2. `blur-my-shell@aunetx`
3. `burn-my-windows@schneegans.github.com`
4. `caffeine@patapon.info`
5. `compiz-windows-effect@hermes83.github.com`
6. `CustomizeClockOnLockScreen@pratap.fastmail.fm`
7. `dash-to-dock@micgx.gmail.com`
8. `desktop-cube@schneegans.github.com`
9. `extension-list@tu.berry`
10. `hanabi-extension@jeffshee.github.io`
11. `logomenu@aryan_k`
12. `mediacontrols@cliffniff.github.com`
13. `PrivacyMenu@stuarthayhurst`
14. `quick-settings-tweaks-master`
15. `Vitals@CoreCoding.com`

- **Install Script**: A script named `install.sh` is provided to automate the installation of these extensions.

---

## Installation Instructions

1. **Ensure Required Dependencies**  
   Ensure you have GNOME Shell and the necessary tools to manage extensions installed on your system.

2. **Make the Script Executable**  
   Run the following command to make the `install.sh` script executable:
   ```sh
   chmod +x install.sh
   ```

3. **Run the Script**  
   Execute the script to install all extensions:
   ```sh
   ./install.sh
   ```

4. **Reload GNOME Shell**  
   After running the script, reload GNOME Shell to apply the changes:
   - Press `Alt + F2`, type `r`, and press Enter.

5. **Manage Extensions**  
   Use the GNOME Extensions app or the Tweaks tool to enable or configure the installed extensions.

---

## Notes

- Extensions are moved to the following directory:
  ```
  ~/.local/share/gnome-shell/extensions
  ```
- If an extension already exists, it will be overwritten.

---
