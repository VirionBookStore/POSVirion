# AS-Pos Android APK
This project wraps the live GitHub Pages app in an Android WebView. The app URL is https://virionbookstore.github.io/POSVirion/.

The APK is built by the GitHub Actions workflow in `.github/workflows/build-aspos-apk.yml`. It is a debug-signed APK (not Play Store release signed). Updating the web app on GitHub Pages updates the content loaded by the installed app, provided the device is online.
