# アイコンと起動画面

`npm run icon` で、`icon.mjs` の絵（紅の振袖の地＝`furisode.mjs`・榧の駒に「傾」）を 1024 の PNG にして `ios/App/App/Assets.xcassets/AppIcon.appiconset` へ、夜の藍の無地 2732 四方を `Splash.imageset` の3枚へ書き出す（どれも透明なしの RGB）。
字は `@fontsource/yuji-boku` の中から「傾」を含む woff2 を探し、TTF に戻して使う。`--preview=<フォルダ>` を付けると 60px の縮小版もそこへ書く。
