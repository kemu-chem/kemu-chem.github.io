window.MANUAL_CONTENT = {
    ja: {
        title: "RefConverter — ヘルプ",
        body: `
<p>RefConverterは、BibTeX・RIS・DOIリストから参考文献リストを生成するツールです。処理はすべてブラウザ内(PyScript)で行われ、入力データはサーバーに送信されません(DOIリストのみ、書誌情報の取得のためCrossrefに問い合わせます)。</p>

<h3>1. 基本の使い方</h3>
<p><strong>1-1. 文献データを入力する</strong><br>
.bib / .ris / .txt(DOIを1行に1つ)ファイルをドロップするか、テキスト欄に直接貼り付けます。入力すると自動で変換されます。
<button class="manual-locate-btn" data-manual-target="#drop_zone">この場所を確認</button></p>

<p><strong>1-2. スタイルとオプションを選ぶ</strong><br>
スタイル欄で引用形式を選びます。並び順(Sort)、著者数の上限(Max Authors)、タイトル省略(Omit Title)、第一著者と最終著者の入れ替え(Reverse 1st &amp; Last)、誌名の略称化(Abbrev. Journal)、DOIの表示(Show DOI)を切り替えられます。
<button class="manual-locate-btn" data-manual-target="#style_select">この場所を確認</button></p>

<p><strong>1-3. 結果をコピーする</strong><br>
出力欄の文献リストを選択してコピーし、Wordなどに貼り付けます。太字・斜体を残したい場合は、Wordでは「元の書式を保持」で貼り付けてください。出力欄はダークモードでも白背景・黒文字のままです(貼り付け先に明るい文字色が入らないようにするため)。
<button class="manual-locate-btn" data-manual-target="#output">この場所を確認</button></p>

<h3>2. Detail:表示の微調整</h3>
<p>「Detail」ボタンで出力欄の書式を調整できます。変換をやり直さずにすぐ反映され、設定は自動で保存されます。
<button class="manual-locate-btn" data-manual-target="#detail_btn">この場所を確認</button></p>
<ul>
  <li><strong>Font / Size</strong>:出力欄のフォントとサイズ(pt)。Customを選ぶと任意のフォント名を入力できます。全スタイル共通です。</li>
  <li><strong>Elements</strong>:著者・タイトル・誌名・年・巻・号・ページ・DOI・出版社ごとに、太字(B)・斜体(I)を「スタイル既定 → オン → オフ」の順で切り替えます。<strong>スタイルごとに別々に保存</strong>されます。</li>
  <li>既定から変えた設定があると、Detailボタンに「Custom」と表示されます。「Reset」でフォント・サイズと、表示中スタイルの要素設定を既定に戻します。</li>
</ul>

<h3>3. スタイルについて</h3>
<p><strong>3-1. Legacy(既定)</strong><br>
従来から使っている、このツール独自の整形です。ACS、APA (7th)、Harvard、Vancouver、Angewandte、RSC、BCSJ、Nature、IEEE、ISO 690に対応しています。</p>
<p><strong>BCSJ</strong>はBCSJ原稿例(2026年)の書式に合わせています:論文タイトルと号は省略、ページは開始ページのみ、年は太字、誌名と巻は斜体です。Show DOIがオンのときは「doi:10.xxxx」をページの後ろ(ページがなければページの代わり)に付けます。BCSJを選ぶと「Abbrev. Journal」が自動でオンになります。</p>

<p><strong>3-2. CSL (beta)</strong><br>
スタイル欄の「CSL (beta)」グループ(「ACS [CSL]」など)は、Zotero等と同じCitation Style Language(CSL)の公式スタイル定義を、citeproc-jsで整形します。ACS、BCSJ / Chem. Lett. (CSJ)、Angewandte Chemie、RSC、Nature、Science、APS (Phys. Rev.)、AIP、IEEE、APA 7th、Chicago (author-date)、Harvard (Cite Them Right)を同梱しています。</p>
<ul>
  <li><strong>Numbers</strong>:CSLスタイルを選ぶとDetailの横に表示されます。文献番号(1、(1)、[1]など)の表示・非表示を切り替えます。Wordの自動番号を使う場合はオフにしてください。</li>
  <li>略称を使うスタイル(ACS、CSJ、APS など)を選ぶと「Abbrev. Journal」が自動でオンになります。略称は内蔵の略称表から引くため、表にない誌名は正式名のままです。</li>
  <li>APA、Chicago、Harvardはスタイル自身の並び順(著者名順など)がSortより優先されます。</li>
  <li>DOIを出力するかどうかはスタイルの定義に従います(Show DOIがオフならDOIは渡しません)。</li>
  <li>beta版のため、出力がLegacyと異なることがあります。問題があればLegacyのスタイルを使ってください。</li>
</ul>

<h3>4. うまくいかないとき</h3>
<ul>
  <li><strong>「Initializing python environment...」のまま進まない</strong>:PyScript(CDN)の読み込みに失敗しています。ネットワーク接続を確認して再読み込みしてください。</li>
  <li><strong>更新後に新しい機能が効かない</strong>:ブラウザに古いファイルがキャッシュされている可能性があります。キャッシュを削除してから再読み込み(Ctrl+Shift+R、またはDevToolsの「キャッシュの消去とハード再読み込み」)してください。</li>
  <li><strong>「Invalid entries found」</strong>:入力の形式を確認してください。BibTeXは「@」、RISは「TY  -」、DOIは「10.」または「http」で始まる必要があります。</li>
</ul>

<p class="manual-security-note">CSLスタイル定義はCitation Style Languageプロジェクト(CC BY-SA 3.0)、整形エンジンはciteproc-js(CPAL / AGPL)を無改変で同梱しています。出典とライセンスは src/csl/README.md を参照してください。</p>
`
    },
    en: {
        title: "RefConverter — Help",
        body: `
<p>RefConverter builds reference lists from BibTeX, RIS or a list of DOIs. Everything runs in your browser (PyScript); your input is not sent to any server, except that DOI lists are looked up on Crossref to fetch the bibliographic data.</p>

<h3>1. Basic use</h3>
<p><strong>1-1. Enter references</strong><br>
Drop a .bib / .ris / .txt (one DOI per line) file, or paste into the text box. Conversion runs automatically.
<button class="manual-locate-btn" data-manual-target="#drop_zone">Show me</button></p>

<p><strong>1-2. Choose a style and options</strong><br>
Pick a citation style. You can also set the sort order, Max Authors, Omit Title, Reverse 1st &amp; Last author, Abbrev. Journal and Show DOI.
<button class="manual-locate-btn" data-manual-target="#style_select">Show me</button></p>

<p><strong>1-3. Copy the result</strong><br>
Select and copy the list in the output box, then paste it into Word etc. To keep bold and italic in Word, paste with "Keep Source Formatting". The output box stays white with dark text even in dark mode, so pasted text never carries a light text color.
<button class="manual-locate-btn" data-manual-target="#output">Show me</button></p>

<h3>2. Detail: fine-tuning the output</h3>
<p>The "Detail" button adjusts how the output looks. Changes apply instantly without re-converting and are saved automatically.
<button class="manual-locate-btn" data-manual-target="#detail_btn">Show me</button></p>
<ul>
  <li><strong>Font / Size</strong>: font and size (pt) of the output box. "Custom" lets you type any font name. Shared by all styles.</li>
  <li><strong>Elements</strong>: per element (author, title, journal, year, volume, issue, pages, DOI, publisher), cycle bold (B) and italic (I) through "style default → on → off". <strong>Saved separately for each style.</strong></li>
  <li>When anything differs from the defaults, the Detail button shows "Custom". "Reset" restores font, size and the current style's element settings.</li>
</ul>

<h3>3. Styles</h3>
<p><strong>3-1. Legacy (default)</strong><br>
The tool's own formatters: ACS, APA (7th), Harvard, Vancouver, Angewandte, RSC, BCSJ, Nature, IEEE and ISO 690.</p>
<p><strong>BCSJ</strong> follows the BCSJ manuscript example (2026): no article title or issue, first page only, bold year, italic journal and volume. With Show DOI on, "doi:10.xxxx" is added after the page (or in place of a missing page). Selecting BCSJ turns "Abbrev. Journal" on.</p>

<p><strong>3-2. CSL (beta)</strong><br>
The "CSL (beta)" group in the style list (e.g. "ACS [CSL]") formats references with the official Citation Style Language (CSL) style files — the same ones Zotero uses — via citeproc-js. Bundled: ACS, BCSJ / Chem. Lett. (CSJ), Angewandte Chemie, RSC, Nature, Science, APS (Phys. Rev.), AIP, IEEE, APA 7th, Chicago (author-date) and Harvard (Cite Them Right).</p>
<ul>
  <li><strong>Numbers</strong>: appears next to Detail when a CSL style is selected; shows or hides reference numbers (1, (1), [1] ...). Turn it off when Word numbers the list.</li>
  <li>Styles that use abbreviated journal titles (ACS, CSJ, APS ...) turn "Abbrev. Journal" on. Abbreviations come from the built-in table; journals not in it keep their full title.</li>
  <li>APA, Chicago and Harvard apply their own ordering (e.g. by author), which overrides Sort.</li>
  <li>Whether a DOI is printed is decided by the style (with Show DOI off, no DOI is passed).</li>
  <li>This is a beta: output may differ from Legacy. If something looks wrong, use a Legacy style.</li>
</ul>

<h3>4. Troubleshooting</h3>
<ul>
  <li><strong>Stuck at "Initializing python environment..."</strong>: PyScript (CDN) failed to load. Check your network and reload.</li>
  <li><strong>A new feature does not work after an update</strong>: your browser may be using cached old files. Clear the cache and reload (Ctrl+Shift+R, or DevTools "Empty cache and hard reload").</li>
  <li><strong>"Invalid entries found"</strong>: check the input format. BibTeX starts with "@", RIS with "TY  -", DOIs with "10." or "http".</li>
</ul>

<p class="manual-security-note">CSL style files are from the Citation Style Language project (CC BY-SA 3.0) and the formatter is citeproc-js (CPAL / AGPL), both bundled unmodified. See src/csl/README.md for sources and licenses.</p>
`
    }
};
