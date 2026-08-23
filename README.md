# Color Highlight for Zed

VS Code の標準 Color Decorators のように、カラーコードの横へ小さなカラーチップを表示する Zed Extension です。

```css
.button {
  color: #ff6b6b;
  background: rgb(78 205 196 / 75%);
  border-color: hsl(45 100% 60%);
}
```

## 対応している色表記

| 表記 | 例 |
| --- | --- |
| HEX | `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA` |
| RGB / RGBA | `rgb(255, 0, 0)`、`rgba(255, 0, 0, .5)` |
| Modern RGB | `rgb(255 0 0 / 50%)` |
| HSL / HSLA | `hsl(120 100% 50%)`、`hsla(120, 100%, 50%, .5)` |
| HWB | `hwb(200 10% 20% / 75%)` |

RGB のパーセント値、HSL の `deg` / `grad` / `rad` / `turn`、各形式のアルファ値にも対応しています。

## インストール（開発版）

1. Zed のコマンドパレットで `zed: install dev extension` を実行します。
2. このリポジトリのルートディレクトリを選択します。

利用者側で Rust や npm package をインストールする必要はありません。リポジトリ直下の `extension.wasm` はビルド済みで、Zed はそれをそのまま読み込みます。Rust のソースと `Cargo.toml` は `adapter/` 以下に分離してあるため、Dev Extension のインストール時にはコンパイルされません。

インストール後は [`examples/colors.md`](./examples/colors.md) を開くと、対応する色をまとめて確認できます。

カラーチップ表示を明示する場合は、Zed の `settings.json` に次を追加してください。現行 Zed では `inlay` が既定値です。

```json
{
  "lsp_document_colors": "inlay"
}
```

表示方法は次から選べます。

| 値 | 表示 |
| --- | --- |
| `inlay` | カラーコードの横に四角いチップを表示 |
| `background` | カラーコードの背景をその色で表示 |
| `border` | カラーコードをその色の枠で囲む |
| `none` | 色の検出と表示を無効化 |

## 対応言語

CSS、HTML、JavaScript（`.jsx` を含む）/ TypeScript、JSON / JSONC / JSON5、Markdown、Clojure、Python、Ruby、Rust、Go、Java、C / C++、C#、PHP、Lua、YAML、TOML、XML、Vue、Svelte、Astro、SCSS / Sass などを対象にしています。正確な一覧は [`extension.toml`](./extension.toml) を参照してください。

## 仕組み

Extension に埋め込まれた軽量な Language Server が LSP の `textDocument/documentColor` で色と範囲を返し、Zed 本体が標準のカラーチップを描画します。Language Server は Zed が提供する Node.js で動作するため、利用時に npm package や外部バイナリをダウンロードしません。

## 開発

Language Server は Node.js の標準機能だけで実装されています。

```sh
npm test
```

埋め込み Language Server または Rust adapter を変更した場合だけ、メンテナーがビルド済み `extension.wasm` を更新します。この操作には Rust の `wasm32-wasip2` target が必要です。

```sh
rustup target add wasm32-wasip2
npm run build:extension
cargo fmt --manifest-path adapter/Cargo.toml --check
cargo check --manifest-path adapter/Cargo.toml --target wasm32-wasip2
```

## 現在の制約

- Zed の通常 Extension API には、任意の UI decoration を直接描画する API がありません。この Extension は Zed 標準のカラーチップ表示を利用します。
- 現行 Zed はカラーチップのクリックを Extension へ公開していないため、VS Code のカラーピッカー操作までは追加しません。
- CSS の名前付き色（`red`、`rebeccapurple` など）、CSS 変数、グラデーション全体のプレビューは現時点では対象外です。
- 色コードらしい文字列を言語の構文に依存せず検出するため、コメントや通常の文字列内に書かれた色も表示対象になります。

## License

[MIT](./LICENSE)
