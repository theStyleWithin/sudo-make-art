# Signing the Android app

Android only installs an update over an existing app if both are signed with the **same key**. The release build signs with a key you own when the repository has these four Actions secrets (Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `ANDROID_KEYSTORE_B64` | your keystore file, base64 encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | the key's alias (the example below uses `sudomakeart`) |
| `ANDROID_KEY_PASSWORD` | the key password |

Without them the build still works, but the APK is signed with a throwaway debug key that is different every time. It installs fine, but to install a newer version you must first uninstall the old one (you lose its local data).

## Make your key (once, on your own computer)
```
keytool -genkeypair -v -keystore sudo-make-art-release.jks -alias sudomakeart -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 sudo-make-art-release.jks        # paste this output as ANDROID_KEYSTORE_B64
```
Then add the four secrets. **Back up the `.jks` file and both passwords somewhere safe and private.** If you lose them you can never publish an update that installs over the old app. Never commit the file or the passwords to the repository.
