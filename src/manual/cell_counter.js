window.MANUAL_CONTENT = {
    ja: {
        title: "Cell Counter — ヘルプ",
        body: `
<p>Cell Counterは、顕微鏡画像から細胞(や粒子)を自動でカウントするツールです。処理はすべてブラウザ内(OpenCV.js)で完結します。画像をR/G/Bチャンネルに分離し、それぞれを二値化してAND/OR/NOTで組み合わせることで、密集した組織の中からでも特定の条件に合う細胞だけを正確に数えられるのが最大の強みです。</p>

<h3>1. 実用例:RGBチャネル別の判定で試す</h3>
<p>下の画像は、許諾を得て使用している実際の蛍光顕微鏡画像です。細胞同士が密集したクラスターの中に、まばらなマーカー陽性細胞(緑/シアン)が点在しています。このような画像では、クラスター全体を1個ずつ数えることは簡単ではありませんが、「マーカー陽性の細胞だけを数えたい」という質問には、チャンネルを組み合わせることで正確に答えられます。</p>
<figure>
  <img src="src/manual/misc/cell_sample_authentic.png" alt="実際の蛍光顕微鏡画像(細胞クラスター)">
  <figcaption>サンプル画像。赤(細胞質など)・青(核)が密集したクラスターを作っており、まばらな緑/シアンのマーカー陽性細胞も見えます。<br>出典: [出典を記入]</figcaption>
</figure>
<p><a class="manual-locate-btn" href="src/manual/misc/cell_sample_authentic.png" download>📥 サンプル画像を保存</a></p>

<p><strong>1-1. 画像を読み込む</strong><br>
ドラッグ&ドロップ、または「Load Image」から読み込みます。
<button class="manual-locate-btn" data-manual-target="#drop_zone">この場所を確認</button></p>

<p><strong>1-2. まず精密に:マーカー陽性の細胞だけを数える(G AND B)</strong><br>
「Channel Parameters」のG・Bタブを開き、それぞれ「Otsu」にチェックを入れます(このサンプルではG≈103、B≈68)。次に「Min area」を5程度に、「Conditional Count」の「＋ Add condition」で条件を作り、1つ目をG、2つ目をBにします。なお、チャンネル別のしきい値は既定で「暗い背景に明るい信号」を正しく想定しているため、グレースケールの場合と違って「Invert」を触る必要はありません。</p>
<p>
  <button class="manual-locate-btn" data-manual-target=".ch-tab[data-ch=g]">Gタブを確認</button>
  <button class="manual-locate-btn" data-manual-target=".ch-tab[data-ch=b]">Bタブを確認</button>
  <button class="manual-locate-btn" data-manual-target="#orig-min-area">Min areaを確認</button>
  <button class="manual-locate-btn" data-manual-target="#cond-add-btn">＋ Add conditionを確認</button>
</p>
<figure>
  <img src="src/manual/misc/authentic_cond_g_and_b.png" alt="G AND B の結果:17個のマーカー陽性細胞">
  <figcaption>「G AND B」の結果。密集したクラスターの中にあっても、マーカー陽性の細胞(17個)だけが正確に浮かび上がります。単純に「Gチャンネルだけ」を見た場合と同じ17個になり、マーカー信号が確かに核と重なっていることも確認できます。</figcaption>
</figure>

<p><strong>1-3. 次に大まかに:組織全体を一括カウントする(R AND B)</strong><br>
同じ「Conditional Count」の仕組みは、精密な絞り込みだけでなく、しきい値を調整すれば良好な一括カウントにも使えます。試しに別の条件行を作り、Rチャンネルのしきい値を0(Otsuではなく手動で)、Bチャンネルのしきい値を102程度(こちらも手動)にし、「Min area」を1、「Max area」を1000に設定してみてください。Rのしきい値0は「組織がある場所すべて」を大まかに拾うゲートの役割、Bの高めのしきい値が個々の核を分離する役割を果たします。</p>
<figure>
  <img src="src/manual/misc/authentic_cond_r_and_b.png" alt="R AND B の結果:およそ325個、組織全体の一括カウント">
  <figcaption>「R AND B」の結果(およそ325個)。密集クラスターの中の核が、かなり良好な精度で個別に検出されます。1-2のG AND Bとは目的が違い、こちらは「大まかな総数」を素早く把握するための設定です。</figcaption>
</figure>
<p>同じAND操作でも、しきい値の選び方次第で「少数を精密に絞り込む」ことにも「大まかな総数を一括で数える」ことにも使えます。AND/OR/NOTそれぞれが具体的に何をしているかは、3で詳しく説明します。</p>

<p><strong>1-4. 手動で補正する:➕ Add Cell / ➖ Delete Cell</strong><br>
1-2・1-3のどちらも、自動検出だけで完璧になるとは限りません。特に密集度が高い部分では、複数の細胞が1個としてまとめて検出されたり、逆に1個の細胞が2個以上に分かれて検出されたりします。これはパラメータの調整不足ではなく、このツールの検出方式(輪郭抽出)そのものの限界です。そこで「➕ Add Cell」モードでクリックすると、その位置に細胞を追加できます。逆に、本来2個の細胞が1個としてまとめて検出されてしまっている場合は、「➖ Delete Cell」でいったん取り消してから、正しい位置に2回追加し直します。この機能は「Detected Cells」の全体表示だけでなく、1-2・1-3で作ったConditional Countの各結果(それぞれに専用のリセットボタンも付いています)にも、同じように使えます。</p>
<figure>
  <img src="src/manual/misc/authentic_crop_before_edit.png" alt="2つの細胞が1つとして検出されている拡大例">
  <figcaption>拡大例:見た目には2つの細胞が接しているが、1つの丸として自動検出されている。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_crop_after_edit.png" alt="削除後に2箇所へ手動追加した拡大例">
  <figcaption>誤検出を削除(赤いバツ印)し、2箇所に手動で追加し直した(オレンジの丸)。</figcaption>
</figure>
<p><button class="manual-locate-btn" data-manual-target=".manual-edit-panel">Manual Edit Modeを確認</button></p>

<p><strong>1-5. 「Distinguish manual edits」で修正内容を可視化する</strong><br>
このチェックを入れると、自動検出(緑)・手動追加(オレンジ)・手動削除(赤いバツ印)が色分けして表示され、件数の内訳(Auto: n, +手動追加, -手動削除)も表示されます。あとで見返すときや、第三者が確認するときに、どこを機械が検出し、どこを人が判断したかを透明にできます。</p>
<p><button class="manual-locate-btn" data-manual-target="#distinguish-manual">Distinguish manual editsを確認</button></p>

<p><strong>1-6. 再現できる形で保存する</strong><br>
画面右下の⚙️(Settings)から「Export JSON」を選ぶと、しきい値などのパラメータに加えて、手動で追加・削除した座標(オート検出結果からの差分)も一緒に保存されます。同じJSONファイルを後で読み込めば、同じ補正状態を再現できます。</p>
<p><button class="manual-locate-btn" data-manual-target=".config-fab">⚙️ Settingsを確認</button></p>

<p><strong>参考:チャンネルを使わない、もっと単純な方法</strong><br>
R/G/Bを分けずに、画像全体をひとまとめ(グレースケール)で二値化するだけの、より単純な一括カウントも可能です。「Invert」を外し、「Threshold」を58程度、「Min area」を1、「Max area」を1000にすると、このサンプルでも約276個を一括検出できます。仕組みの詳細は2で説明します。</p>

<p>これがCell Counterの本来の使いどころです。用途に応じてチャンネルとしきい値を選ぶことで、「どの細胞が特定の条件を満たすか」にも「全体でおよそ何個あるか」にも、高い精度で答えられます。自動検出だけでは完璧にならないことがあるため、手動修正機能があります。</p>

<h3>2. 原理:チャンネル別の二値化としきい値の意味</h3>
<p>Cell Counterの内部処理は、常に同じ手順の繰り返しです。「1枚の画像 → 明るさをもとに信号あり/なしの2値に分ける(二値化) → 検出された部分の形(面積・円形度)を調べて細胞かどうか判定する」。1で使ったグレースケールとR/G/Bチャンネル別の違いは、「どの明るさ情報を見るか」だけです。なお、二値化した結果をどう色で表示するかは場面によって異なります(グレースケールの「Threshold Mask」表示は白黒、R/G/Bチャンネル別のマスク表示はそれぞれ赤・緑・青)。以下では色ではなく「検出あり/なし」で統一して説明します。</p>

<p><strong>2-1. グレースケール = 1枚、チャンネル別 = 3枚</strong><br>
グレースケールは、画像全体を1枚の明るさ情報(白黒写真のようなもの)にまとめてから二値化します。手軽ですが、色の違いは失われます。一方チャンネル別は、同じ画像をR・G・Bという3枚の独立した明るさ情報として扱い、それぞれを別々に二値化します。色(染色の種類)ごとに判定したいときは、こちらが必要です。</p>

<p><strong>2-2. しきい値(Threshold)とは何か</strong><br>
しきい値は、「この明るさより上を検出あり、下を検出なしとみなす」という境界線です。0〜255の値で指定します。「Otsu auto-threshold」は、画像の明るさの分布から、検出あり/なしがもっともくっきり分かれる境界線を統計的に自動計算する機能で、良い出発点になります。ただし常に最適とは限りません。1-3で「Rのしきい値をあえて0にする」「Bのしきい値をOtsuより高くする」といった調整をしたように、目的に応じて意図的にOtsuからずらすことで、狙った効果を得られる場合もあります。</p>
<figure>
  <img src="src/manual/misc/authentic_mask_r.png" alt="Rチャンネルのマスク(しきい値0)">
  <figcaption>Rチャンネル、しきい値0でのマスク(実際の「R mask」表示と同じ、赤=検出領域)。ほぼ組織がある場所全体が赤くなり、「ここに何かある」という大まかなゲートになっています。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_b.png" alt="Bチャンネルのマスク(しきい値102)">
  <figcaption>Bチャンネル、しきい値102でのマスク(実際の「B mask」表示と同じ、青=検出領域)。しきい値を上げたことで、個々の核に近い、粒として分離した形になっています。</figcaption>
</figure>
<p>同じ画像でも、しきい値をどこに引くかで「大まかな範囲」にも「個々の粒」にもなります。1-3の「R AND B」は、この2枚(広いRのマスクと、粒状のBのマスク)を重ね合わせていた、というのが実体です。</p>

<p><strong>2-3. Invertの向きが違う理由</strong><br>
「Invert」は、検出ありと判定する向きを反転させるスイッチです。グレースケール(Global)は既定でチェックが入っていますが、チャンネル別(R/G/B)は既定でチェックが外れています。これは想定している画像の違いによるものです。チャンネル別に扱う蛍光染色画像は「暗い背景に明るい信号」であることがほとんどなので、そのままで正しく動作します。一方グレースケールで画像全体を見る場合は、明暗どちらのパターンもありうるため、状況に応じて調整が必要になります。</p>

<p><strong>2-4. 二値化のあとの形状フィルタ</strong><br>
二値化しただけでは、ノイズの点や、細胞ではない染みも「検出された塊」として拾われてしまいます。そこで「Min/Max area(面積)」「Min circularity(円形度、1.00が正円)」で、大きさや形が細胞らしくない塊を除外します。この形状フィルタは、グレースケールでもチャンネル別(Conditional Count)でも共通の設定(Global設定)が使われます。</p>

<p>この「二値化 → 形状フィルタ」という同じ仕組みの上に、チャンネル別ではさらにAND/OR/NOTによる組み合わせが加わります。その具体的な意味は3で説明します。</p>

<h3>3. AND / OR / NOTの意味</h3>
<p>AND/OR/NOTは、2で見たような2値のマスク画像同士を、ピクセル単位で重ね合わせる操作です。1-2で使ったG・Bのしきい値(G≈103, B≈68)をそのまま使って、3つの演算がそれぞれ何をしているかを具体的に見ていきます。以下は、実際の「Mask」表示(検出領域を白で表示するモード)と同じ形式で、画像の一部を拡大したものです。</p>
<figure>
  <img src="src/manual/misc/authentic_crop_original.png" alt="拡大した元画像の範囲">
  <figcaption>これから見るマスクの元になっている範囲(拡大)。マーカー陽性(緑)の核と、陽性ではない核が混在しています。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_r.png" alt="この範囲のRマスク(赤、しきい値0)">
  <figcaption>この範囲のRマスク(実際の「R mask」表示と同じ、赤=検出領域。1-3・2-2と同じしきい値0)。ほぼ全体が赤くなり、個々の細胞は区別できません。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_g.png" alt="この範囲のGマスク(緑)">
  <figcaption>この範囲のGマスク(実際の「G mask」表示と同じ、緑=検出領域)。検出領域は少数です。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_b.png" alt="この範囲のBマスク(青)">
  <figcaption>この範囲のBマスク(実際の「B mask」表示と同じ、青=検出領域)。核の数だけ、より多くの検出領域があります。</figcaption>
</figure>

<p><strong>3-1. AND:両方とも検出されている場所だけ残す</strong><br>
「G AND B」は、Gのマスクで検出され、かつBのマスクでも検出されているピクセルだけを残します。1-2ですでに見た通り、結果は17個で、「Gだけ」を見た場合と完全に一致します。マーカー信号(G)は、必ず核(B)の中に収まっているということです。ANDは、2つの条件を両方満たす、絞り込まれた集合を数えたいときに向いています(共陽性・共局在)。</p>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_and.png" alt="この範囲のAND(G AND B)マスク">
  <figcaption>「G AND B」のマスク。Gマスクとほぼ同じ形になります(Gの領域はすべてBにも含まれるため)。</figcaption>
</figure>

<p><strong>3-2. OR:どちらか一方でも検出されていれば残す</strong><br>
「G OR B」は、GかBのどちらか一方でも検出されていれば残します。</p>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_or.png" alt="この範囲のOR(G OR B)マスク">
  <figcaption>「G OR B」のマスク。Bマスクとほぼ同じ形になります。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_cond_g_or_b.png" alt="G OR B の結果:255個、ほぼB全体">
  <figcaption>画像全体で見た「G OR B」の結果(255個)。「B単体」で数えた場合とほぼ同じ数になります。Gはもともと少数でBの中にほぼ完全に収まっているため、ORを取ってもBの範囲がそのまま結果を支配してしまうからです。</figcaption>
</figure>
<p>ORは、2つのチャンネルが互いに重ならない・別々の場所を示している場合に「どちらかで陽性なら数えたい(取りこぼしを防ぎたい)」という場面で威力を発揮します。今回のように一方がもう一方にほぼ完全に含まれている場合は、広い方のチャンネル単体とほぼ同じ結果になり、あまり意味がありません。</p>

<p><strong>3-3. NOT:指定した場所を除外する</strong><br>
「B AND NOT G」は、Bのマスクから、Gで検出されている場所を取り除きます。「核はあるが、マーカー陽性ではない細胞」を数える形になります。</p>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_not.png" alt="この範囲のNOT(B AND NOT G)マスク">
  <figcaption>「B AND NOT G」のマスク。Bマスクから、Gの部分が欠けた(えぐれた)形になっているのが分かります。塊の内部が欠けたことで、いくつかの塊は2つに分裂しています。</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_cond_b_not_g.png" alt="B AND NOT G の結果:261個">
  <figcaption>画像全体で見た「B AND NOT G」の結果(261個)。単純に255から17を引いた238ではなく、それより多くなっています。これは、上のマスク画像で見えるように、Gの領域がBの塊のちょうど内部にあった場合、そこを削ることで塊が2つに分裂し、個数としては逆に増えることがあるためです。NOTはピクセル単位の面積を削る操作であって、個数をそのまま引き算するわけではない、という点に注意してください。</figcaption>
</figure>

<p><strong>3-4. まとめ</strong></p>
<table style="width:100%; border-collapse:collapse; font-size:0.92em; margin:8px 0;">
<tr style="background:#f8fafc;"><th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0;">演算</th><th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0;">検出される条件</th><th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0;">主な使いどころ</th></tr>
<tr><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">AND</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">両方のチャンネルで検出されている場所だけ</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">2色に共陽性の細胞だけ数えたい(共局在)</td></tr>
<tr><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">OR</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">どちらか一方でも検出されている場所</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">どちらかの色で陽性なら数えたい(取りこぼし防止)</td></tr>
<tr><td style="padding:6px 8px;">NOT</td><td style="padding:6px 8px;">指定したチャンネルの検出領域を除外</td><td style="padding:6px 8px;">特定の色の反応(自家蛍光やノイズ、あるいは今回のように既知のマーカー陽性細胞)を除外したい</td></tr>
</table>

<h3>4. コツ・応用(準備中)</h3>
`
    },
    en: {
        title: "Cell Counter — Help",
        body: `
<p>Cell Counter automatically counts cells (or particles) from microscopy images, with all processing done entirely in your browser via OpenCV.js. Its biggest strength: splitting the image into R/G/B channels, binarizing each one, and combining them with AND/OR/NOT — so you can accurately count cells matching a specific condition even inside tissue too dense to count as a whole.</p>

<h3>1. Worked Example: Judging by RGB Channels</h3>
<p>The image below is a real fluorescence microscopy image, used with permission. Densely packed cell clusters contain a sparse population of marker-positive cells (green/cyan). Counting every cell in a cluster one by one isn't easy — but "how many cells are marker-positive?" is a question channel combinations can answer precisely.</p>
<figure>
  <img src="src/manual/misc/cell_sample_authentic.png" alt="Real fluorescence microscopy image (cell clusters)">
  <figcaption>Sample image: red (e.g. cytoplasm) and blue (nuclei) form dense clusters, with a sparse green/cyan marker-positive population also visible.<br>Source: [add citation]</figcaption>
</figure>
<p><a class="manual-locate-btn" href="src/manual/misc/cell_sample_authentic.png" download>📥 Save the sample image</a></p>

<p><strong>1-1. Load the image</strong><br>
Drag and drop it, or use "Load Image".
<button class="manual-locate-btn" data-manual-target="#drop_zone">Show me</button></p>

<p><strong>1-2. Precise first: count only the marker-positive cells (G AND B)</strong><br>
Open the G and B tabs under "Channel Parameters" and check "Otsu" on each (about 103 for G, 68 for B on this sample). Then raise "Min area" to about 5, click "＋ Add condition" under "Conditional Count", and set the first term to G and the second to B. Unlike the grayscale pipeline, per-channel thresholding already assumes "bright signal on a dark background" by default, so there's no need to touch "Invert" here.</p>
<p>
  <button class="manual-locate-btn" data-manual-target=".ch-tab[data-ch=g]">Show me the G tab</button>
  <button class="manual-locate-btn" data-manual-target=".ch-tab[data-ch=b]">Show me the B tab</button>
  <button class="manual-locate-btn" data-manual-target="#orig-min-area">Show me Min area</button>
  <button class="manual-locate-btn" data-manual-target="#cond-add-btn">Show me ＋ Add condition</button>
</p>
<figure>
  <img src="src/manual/misc/authentic_cond_g_and_b.png" alt="G AND B result: 17 marker-positive cells">
  <figcaption>Result of "G AND B". Even inside the dense clusters, only the marker-positive cells (17 of them) are precisely picked out. That matches the count from the G channel alone, confirming the marker signal genuinely overlaps real nuclei.</figcaption>
</figure>

<p><strong>1-3. Rough next: count the whole tissue in bulk (R AND B)</strong><br>
The same Conditional Count mechanism isn't just for precise filtering — tuned differently, it also gives a good bulk count. Try building another rule with the R channel threshold set to 0 (manually, not Otsu) and the B channel threshold set to about 102 (also manually), with "Min area" at 1 and "Max area" at 1000. An R threshold of 0 acts as a rough gate for "anywhere tissue is present," while the higher B threshold is what actually separates individual nuclei.</p>
<figure>
  <img src="src/manual/misc/authentic_cond_r_and_b.png" alt="R AND B result: about 325 cells, a bulk count of the whole tissue">
  <figcaption>Result of "R AND B" (about 325 cells). Nuclei throughout the dense clusters are individually detected with reasonably good accuracy. Unlike 1-2's G AND B, the goal here is a fast, rough total rather than a precise subset.</figcaption>
</figure>
<p>The same AND operation, with different threshold choices, can either narrow things down precisely or give a good bulk total. Section 3 explains exactly what AND/OR/NOT are doing here.</p>

<p><strong>1-4. Correct it by hand: ➕ Add Cell / ➖ Delete Cell</strong><br>
Neither 1-2 nor 1-3 is guaranteed to be perfect from automatic detection alone. Especially in the densest areas, several cells can get merged into a single detection, or one cell can get split into two or more. This isn't a matter of tuning parameters better — it's an inherent limit of this tool's contour-based detection. In "➕ Add Cell" mode, clicking places a cell marker at that spot. If two cells were merged into a single detection, use "➖ Delete Cell" to remove it first, then add two markers in the right places instead. This works not only on the overall "Detected Cells" view, but equally on each Conditional Count result from 1-2/1-3 (each of which has its own reset button too).</p>
<figure>
  <img src="src/manual/misc/authentic_crop_before_edit.png" alt="Close-up: two cells detected as one">
  <figcaption>Close-up: two visibly distinct cells, but detected as a single circle.</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_crop_after_edit.png" alt="Close-up: corrected to two manual markers">
  <figcaption>The mis-detection deleted (red X) and replaced with two manual markers (orange).</figcaption>
</figure>
<p><button class="manual-locate-btn" data-manual-target=".manual-edit-panel">Show me Manual Edit Mode</button></p>

<p><strong>1-5. Visualize your corrections with "Distinguish manual edits"</strong><br>
Checking this color-codes automatic detections (green), manual additions (orange), and manual deletions (red X), and breaks the count down (Auto: n, +added, -deleted). It keeps a transparent record of what the algorithm found versus what a human decided — useful when you revisit the image later, or when someone else needs to check your work.</p>
<p><button class="manual-locate-btn" data-manual-target="#distinguish-manual">Show me Distinguish manual edits</button></p>

<p><strong>1-6. Save it in a reproducible form</strong><br>
The ⚙️ (Settings) button in the bottom-right corner has an "Export JSON" option, which saves your threshold parameters together with the coordinates of everything you added or deleted by hand — the diff from the automatic result. Reloading that same JSON file later restores the exact same corrections.</p>
<p><button class="manual-locate-btn" data-manual-target=".config-fab">Show me ⚙️ Settings</button></p>

<p><strong>Also worth knowing: a simpler, channel-free method</strong><br>
You can also skip channels entirely and binarize the whole image at once (grayscale) for a simpler bulk count. Uncheck "Invert", set "Threshold" to about 58, "Min area" to 1, and "Max area" to 1000, and this sample detects around 276 cells in one pass. Section 2 explains the mechanics behind this.</p>

<p>This is what Cell Counter is really for. Depending on which channels and thresholds you choose, it can answer both "which cells meet this specific condition?" and "roughly how many cells are there in total?" with good accuracy. Automatic detection alone won't always be perfect, which is why the manual-correction workflow exists.</p>

<h3>2. The Mechanics: Per-Channel Binarization and What a Threshold Means</h3>
<p>Cell Counter's internal processing is always the same loop: take one image → split it into signal / no-signal by brightness (binarize) → check the shape (area, circularity) of the detected regions to decide what counts as a cell. The difference between grayscale and per-channel (R/G/B) from section 1 is simply which brightness information you're looking at. (How a binarized result gets colored on screen varies: grayscale's "Threshold Mask" view renders in black and white, while each R/G/B channel's own mask view is tinted red/green/blue. The explanation below talks about "detected / not detected" rather than color, since color depends on which view you're looking at.)</p>

<p><strong>2-1. Grayscale = one image, per-channel = three</strong><br>
Grayscale collapses the whole image into a single brightness map (like a black-and-white photo) before binarizing it. It's convenient, but color information is lost. Per-channel treats the same image as three independent brightness maps — R, G, and B — each binarized separately. If you need to judge by stain/color, this is what you need.</p>

<p><strong>2-2. What "Threshold" actually means</strong><br>
A threshold is a cutoff line: "above this brightness counts as detected, below it doesn't," specified as a value from 0–255. "Otsu auto-threshold" statistically computes the cutoff that splits the image's brightness distribution most cleanly — a good starting point, but not always optimal. As in 1-3, where we deliberately set R's threshold to 0 and pushed B's threshold above its Otsu value, intentionally moving away from Otsu can get you a specific, useful effect.</p>
<figure>
  <img src="src/manual/misc/authentic_mask_r.png" alt="R channel mask (threshold 0)">
  <figcaption>The R channel mask at threshold 0 (same as the tool's actual "R mask" display — red = detected). Nearly everywhere tissue exists turns red: a rough gate for "something is here."</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_b.png" alt="B channel mask (threshold 102)">
  <figcaption>The B channel mask at threshold 102 (same as the tool's actual "B mask" display — blue = detected). Raising the threshold turns it into distinct, grain-like blobs close to individual nuclei.</figcaption>
</figure>
<p>The same image can become either "a broad area" or "individual grains," depending on where you set the threshold. 1-3's "R AND B" was, concretely, these two masks — the broad R mask and the grain-like B mask — overlaid on each other.</p>

<p><strong>2-3. Why Invert's default differs</strong><br>
"Invert" flips which brightness direction counts as detected. It's checked by default for grayscale (Global), but unchecked by default for the per-channel (R/G/B) tabs. That's because of what each is assumed to look at: fluorescence images handled per-channel are almost always "bright signal on a dark background," so the default just works. Grayscale, looking at the whole image at once, could reasonably be either pattern, so it needs adjusting per image.</p>

<p><strong>2-4. Shape filtering after binarization</strong><br>
Binarizing alone will also pick up noise specks and non-cell blobs as detected regions. "Min/Max area" and "Min circularity" (1.00 = a perfect circle) filter those out by size and shape. This shape filter is shared (a Global setting) between the grayscale pipeline and every Conditional Count rule.</p>

<p>On top of this same "binarize → shape filter" mechanism, the per-channel approach adds one more layer: combining channels with AND/OR/NOT. Section 3 explains exactly what that means.</p>

<h3>3. What AND / OR / NOT Actually Do</h3>
<p>AND/OR/NOT overlay binary masks like the ones in section 2, pixel by pixel. Using the same G and B thresholds from 1-2 (G≈103, B≈68), here's exactly what each operation does. The crops below match the tool's actual "Mask" view (detected regions shown in white).</p>
<figure>
  <img src="src/manual/misc/authentic_crop_original.png" alt="Zoomed-in region the masks below are drawn from">
  <figcaption>The region these masks are drawn from (zoomed in). A mix of marker-positive (green) and marker-negative nuclei.</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_r.png" alt="R mask of this region (red, threshold 0)">
  <figcaption>The R mask for this region (same as the tool's actual "R mask" display — red = detected; threshold 0, same as 1-3 / 2-2). Nearly the whole area turns red, with no way to distinguish individual cells.</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_g.png" alt="G mask of this region (green)">
  <figcaption>The G mask for this region (same as the tool's actual "G mask" display — green = detected). Only a few detected regions.</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_b.png" alt="B mask of this region (blue)">
  <figcaption>The B mask for this region (same as the tool's actual "B mask" display — blue = detected). Many more detected regions — one per nucleus.</figcaption>
</figure>

<p><strong>3-1. AND: keep only where both are detected</strong><br>
"G AND B" keeps a pixel only if it's detected in the G mask AND detected in the B mask. As we already saw in 1-2, the result is 17 — an exact match for "G alone." The marker signal (G) always falls inside a nucleus (B). AND is the right tool when you want a narrowed-down set that satisfies both conditions (co-positivity / co-localization).</p>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_and.png" alt="AND (G AND B) mask of this region">
  <figcaption>The "G AND B" mask. Nearly identical to the G mask alone, since every G region is also inside B.</figcaption>
</figure>

<p><strong>3-2. OR: keep if either is detected</strong><br>
"G OR B" keeps a pixel if either G or B is detected there.</p>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_or.png" alt="OR (G OR B) mask of this region">
  <figcaption>The "G OR B" mask. Nearly identical to the B mask alone.</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_cond_g_or_b.png" alt="G OR B result: 255, essentially all of B">
  <figcaption>Result of "G OR B" across the whole image (255). Nearly identical to counting B alone. Since G is a small population almost entirely contained within B, OR-ing them just lets B's extent dominate the result.</figcaption>
</figure>
<p>OR shines when two channels mark different, non-overlapping things and you want "positive in either" so nothing gets missed. When one channel is almost entirely contained inside the other, as here, OR just reduces to the broader channel alone and isn't especially useful.</p>

<p><strong>3-3. NOT: exclude a specific region</strong><br>
"B AND NOT G" removes anywhere G is detected from the B mask — effectively "nuclei that exist, but aren't marker-positive."</p>
<figure>
  <img src="src/manual/misc/authentic_mask_crop_not.png" alt="NOT (B AND NOT G) mask of this region">
  <figcaption>The "B AND NOT G" mask. You can see bites taken out of the B mask wherever G was — and a couple of blobs have split into two as a result.</figcaption>
</figure>
<figure>
  <img src="src/manual/misc/authentic_cond_b_not_g.png" alt="B AND NOT G result: 261">
  <figcaption>Result of "B AND NOT G" across the whole image (261). Not simply 255 − 17 = 238 — it's higher. As visible in the mask crop above, when a G region sits right in the middle of a B blob, cutting it out can split that blob into two separate pieces, increasing the count. NOT subtracts area pixel-by-pixel — it doesn't just subtract a number of objects.</figcaption>
</figure>

<p><strong>3-4. Summary</strong></p>
<table style="width:100%; border-collapse:collapse; font-size:0.92em; margin:8px 0;">
<tr style="background:#f8fafc;"><th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0;">Operator</th><th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0;">Detected when...</th><th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e2e8f0;">Typical use</th></tr>
<tr><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">AND</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">Detected in both channels</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">Count only cells co-positive for two markers (co-localization)</td></tr>
<tr><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">OR</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">Detected in either channel</td><td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;">Count anything positive for either marker (avoid missing cells)</td></tr>
<tr><td style="padding:6px 8px;">NOT</td><td style="padding:6px 8px;">Detected in the base channel, excluding the given one</td><td style="padding:6px 8px;">Exclude a specific signal (autofluorescence, noise, or — as here — a known marker-positive population)</td></tr>
</table>

<h3>4. Tips &amp; Advanced Use (coming soon)</h3>
`
    }
};
