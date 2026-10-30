# 舞台の背景の絵（Blender）

`build.py` が、3つの舞台（kabuki・ukiyoe・byobu）の背景の絵を `public/stages/<舞台>/` に書き出す。
奥（back）・中（mid）・手前（front）の3枚と、設定画面の見本（thumb）。

```bash
"/c/Program Files/Blender Foundation/Blender 4.5/blender.exe" --background --factory-startup --python tools/stage/build.py
```

- 1つだけ：`-- kabuki` のように名前を付ける
- 横長の絵（パソコンの広い画面用、1920×1080）：`-- --wide`。`back-wide.webp` などに書き出す（横長の画面では自動でこちらを使う）
- 荒く速く（構図の確認）：`-- --fast`
- 3つで4分ほど（CPU で描く）
- 置き場所は `scr(u, v, y)`（画面の左右 u・上下 v を -1〜1、奥行き y）で決める。画面の真ん中は対局の盤が乗るので、見せ場は上と下に置く
- 絵を手描きの絵に替えたいときは、同じ名前・同じ縦横比（9:16）の WebP を置き換えればよい
