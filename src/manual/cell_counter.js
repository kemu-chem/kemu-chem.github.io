window.MANUAL_CONTENT = {
    ja: {
        title: "Cell Counter — ヘルプ",
        body: `
<h3>① 実用例:サンプル画像で試す</h3>
<p>下のサンプル画像には、実際につまずきやすい検出パターン(重なった細胞・中心が空洞の細胞・ノイズの点・複数チャンネルの組み合わせ)をあえて詰め込んであります。保存して、実際にツールへドラッグ&ドロップしながら読み進めることをお勧めします。</p>
<figure>
  <img src="src/manual/misc/cell_sample.png" alt="サンプル画像(細胞4個+ノイズの点)">
  <figcaption>サンプル画像。細胞4個(左上・右上・左下・右下)と、細胞の外にある小さいノイズの点が写っています。</figcaption>
</figure>
<p><a class="manual-locate-btn" href="src/manual/misc/cell_sample.png" download>📥 サンプル画像を保存</a></p>

<p><strong>1. 画像を読み込む</strong><br>
ドラッグ&ドロップ、または「Load Image」から読み込みます。
<button class="manual-locate-btn" data-manual-target="#drop_zone">この場所を確認</button></p>

<p><strong>2. まずはこのままでは正しく検出できません</strong><br>
「Invert」は既定でチェックが入っています。これは「明るい背景に暗い細胞」という画像を想定した設定です。このサンプルのように<strong>暗い背景に明るい細胞</strong>が写っている場合は、逆にチェックを外す必要があります。</p>
<figure>
  <img src="src/manual/misc/cell_sample_mask_default.png" alt="既定設定(Invert ON)で二値化した結果">
  <figcaption>既定設定のまま二値化した結果(白=検出された領域)。背景全体が真っ白になり、肝心の細胞が黒い穴として抜けてしまっています。</figcaption>
</figure>
<p><button class="manual-locate-btn" data-manual-target="#invert">Invertのチェックを外す</button></p>

<p><strong>3. しきい値を自動設定する</strong><br>
「Otsu auto-threshold」にチェックを入れると、しきい値が自動計算されます(このサンプルでは約50)。「Threshold Mask」表示に切り替えると、二値化の結果を直接確認できます。</p>
<figure>
  <img src="src/manual/misc/cell_sample_mask_correct.png" alt="Invertを外しOtsuで二値化した正しい結果">
  <figcaption>Invertを外し、Otsuで二値化した結果。4つの細胞と、外側の小さいノイズの点が正しく白く抜き出されています。</figcaption>
</figure>
<p>
  <button class="manual-locate-btn" data-manual-target="#otsu">Otsuを確認</button>
  <button class="manual-locate-btn" data-manual-target=".view-btn[data-view=thresh]">Threshold Mask表示を確認</button>
</p>

<p><strong>4. ノイズの点を除外する</strong><br>
「Detected Cells」表示に戻すと、この時点では5個検出されます(期待は4個)。まず「Min area」を150程度まで上げて、細胞より明らかに小さいノイズの点を除外しましょう。</p>

<p><strong>5. 最後の1個のズレを直す</strong><br>
Min areaを上げても、まだ5個のままのはずです。原因は、右上の細胞の内部にある「輪っか状の構造」(外側が明るく、中心にもう一度明るい部分がある)です。中心の明るい部分が、外側の輪っかから細い暗い隙間で切り離されているため、別の細胞として誤ってカウントされています。</p>
<figure>
  <img src="src/manual/misc/cell_sample_result_before_close.png" alt="Close iterations適用前:5個検出">
  <figcaption>Min areaでノイズを除外した直後。右上の細胞の内部に、誤って2重にカウントされた小さい丸が見えます(合計5個)。</figcaption>
</figure>
<p>「Close iterations」を7〜8程度まで上げると、この隙間が埋まり、正しく1つの細胞としてまとまります。
<button class="manual-locate-btn" data-manual-target="#orig-min-area">Min areaを確認</button>
<button class="manual-locate-btn" data-manual-target="#orig-morph-close">Close iterationsを確認</button></p>
<figure>
  <img src="src/manual/misc/cell_sample_result_after_close.png" alt="Close iterations適用後:4個検出">
  <figcaption>Close iterationsを上げた後。4つの細胞が、それぞれ正しく1個ずつカウントされています。</figcaption>
</figure>

<p>下部の検出数が <strong>4</strong> になれば成功です。「Save Result」で、この結果画像をPNG/JPEGとして保存できます。
<button class="manual-locate-btn" data-manual-target="#result-count">検出数を確認</button></p>

<h3>② グレースケールでの二値化について(準備中)</h3>
<p>ここでは①で行った「しきい値→形状フィルタ」の仕組みを、より一般的に説明します。</p>

<h3>③ チャンネル別の論理演算について(準備中)</h3>
<p>R/G/Bチャンネルを個別に二値化し、AND/OR/NOTで組み合わせて細胞を同定する、このツール本来の使い方を説明します。</p>

<h3>④ コツ・応用(準備中)</h3>
`
    },
    en: {
        title: "Cell Counter — Help",
        body: `
<h3>① Worked Example: Try It With the Sample Image</h3>
<p>The sample image below deliberately packs in the detection patterns that trip people up most often: touching/merged cells, hollow (ring-shaped) cells, stray noise dots, and cells that only show up in some color channels. We recommend saving it and dragging it into the tool as you read.</p>
<figure>
  <img src="src/manual/misc/cell_sample.png" alt="Sample image (4 cells + noise dots)">
  <figcaption>Sample image: 4 cells (top-left, top-right, bottom-left, bottom-right) plus small noise dots scattered outside them.</figcaption>
</figure>
<p><a class="manual-locate-btn" href="src/manual/misc/cell_sample.png" download>📥 Save the sample image</a></p>

<p><strong>1. Load the image</strong><br>
Drag and drop it, or use "Load Image".
<button class="manual-locate-btn" data-manual-target="#drop_zone">Show me</button></p>

<p><strong>2. This won't work correctly yet</strong><br>
"Invert" is checked by default, which assumes a "dark cells on a light background" image. This sample is the opposite — <strong>bright cells on a dark background</strong> — so it needs to be unchecked.</p>
<figure>
  <img src="src/manual/misc/cell_sample_mask_default.png" alt="Binarized with the default Invert setting">
  <figcaption>Result with default settings (white = detected). The whole background turns white, and the actual cells are punched out as black holes — the opposite of what we want.</figcaption>
</figure>
<p><button class="manual-locate-btn" data-manual-target="#invert">Uncheck Invert</button></p>

<p><strong>3. Auto-compute the threshold</strong><br>
Check "Otsu auto-threshold" to compute it automatically (about 50 for this sample). Switch to the "Threshold Mask" view to see the binarization directly.</p>
<figure>
  <img src="src/manual/misc/cell_sample_mask_correct.png" alt="Correct binarization after unchecking Invert and enabling Otsu">
  <figcaption>With Invert off and Otsu on, the 4 real cells and the small noise dots are correctly pulled out in white.</figcaption>
</figure>
<p>
  <button class="manual-locate-btn" data-manual-target="#otsu">Show me Otsu</button>
  <button class="manual-locate-btn" data-manual-target=".view-btn[data-view=thresh]">Show me Threshold Mask</button>
</p>

<p><strong>4. Filter out the noise dots</strong><br>
Switch back to "Detected Cells" — at this point it counts 5 (we expect 4). Raise "Min area" to around 150 to exclude the dots, which are clearly smaller than a real cell.</p>

<p><strong>5. Fix the last miscount</strong><br>
Even after raising Min area, it's still 5. The cause is the "ring" structure inside the top-right cell (bright outer ring, bright center again). The bright center is cut off from the outer ring by a thin dark gap, so it gets counted as a second, separate cell.</p>
<figure>
  <img src="src/manual/misc/cell_sample_result_before_close.png" alt="Before Close iterations: 5 detected">
  <figcaption>Right after filtering by area. Notice the small extra circle inside the top-right cell — that's the double-count (5 total).</figcaption>
</figure>
<p>Raising "Close iterations" to around 7–8 bridges that gap so it's correctly merged into one cell.
<button class="manual-locate-btn" data-manual-target="#orig-min-area">Show me Min area</button>
<button class="manual-locate-btn" data-manual-target="#orig-morph-close">Show me Close iterations</button></p>
<figure>
  <img src="src/manual/misc/cell_sample_result_after_close.png" alt="After Close iterations: 4 detected">
  <figcaption>After raising Close iterations, all 4 cells are each counted exactly once.</figcaption>
</figure>

<p>Success looks like a detected count of <strong>4</strong>. Use "Save Result" to export this image as PNG/JPEG.
<button class="manual-locate-btn" data-manual-target="#result-count">Show me the count</button></p>

<h3>② Grayscale Binarization, Explained (coming soon)</h3>
<p>A more general explanation of the "threshold → shape filter" mechanism used in step ①.</p>

<h3>③ Combining Channels With Logic (coming soon)</h3>
<p>How to threshold R/G/B channels independently and combine them with AND/OR/NOT — this tool's core method for identifying cells.</p>

<h3>④ Tips &amp; Advanced Use (coming soon)</h3>
`
    }
};
