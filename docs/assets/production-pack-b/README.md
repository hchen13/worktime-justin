# Production Pack B

对应飞书卡：`WTJ-20260704-006`。

本包交付秘密词词池与 sprite 库 v1。目标词池一次性定为 100 个儿童常见英语词，其中 67 个已有生产级透明 PNG，其余 33 个先接入统一 placeholder，并在 `missing-assets.json` 中列出后续批次，避免开发被素材缺口阻塞。

## 产物

- `manifest.json`: 100 词词池，字段包含 `word`、`first_letter`、`display_name`、`asset_path`、`sound_key`、`status`、`batch`、`intended_asset_path`。
- `sprites/`: 67 个生产级秘密词 sprite，均为 `1024x1024 RGBA` 透明 PNG。
- `stubs/secret-word-placeholder.png`: pending 词的临时占位素材，来自 A 包问号 token。
- `missing-assets.json`: 33 个待生产词的完整缺口清单和计划批次。
- `source/`: 三张批量生成源图、alligator/letter-E/letter-G/letter-H/letter-I/letter-J/letter-K/letter-L/letter-M/letter-N/letter-O/letter-P 单图源图、去背 alpha 与提示词记录。
- `contact-sheets/secret-word-sprites-v1-contact-sheet.png`: 暗底评审接触表。

## Ready 词

`apple`, `ant`, `airplane`, `alligator`, `ball`, `basket`, `bell`, `banana`, `cat`, `car`, `cup`, `cake`, `dog`, `door`, `duck`, `drum`, `egg`, `elephant`, `eye`, `envelope`, `fish`, `flower`, `frog`, `faucet`, `goat`, `grapes`, `gift`, `guitar`, `horse`, `hat`, `heart`, `house`, `icecream`, `igloo`, `insect`, `island`, `juice`, `jam`, `jar`, `jellyfish`, `key`, `kite`, `koala`, `kettle`, `lamp`, `leaf`, `lion`, `lemon`, `moon`, `mouse`, `milk`, `monkey`, `nest`, `nose`, `net`, `noodle`, `orange`, `owl`, `octopus`, `oven`, `pig`, `pear`, `pencil`, `pizza`, `rocket`, `star`, `treasure`。

其中 `apple`、`ball`、`basket`、`car`、`cat`、`dog`、`star`、`treasure` 复用 v3 sprite 基准；`bell`、`door`、`faucet`、`horse`、`lamp` 复用 A 包任务道具；`alligator` 来自 `WTJ-20260704-033` 单图补齐；`eye`、`envelope` 来自 `WTJ-20260704-034` 单图补齐；`goat`、`gift`、`guitar` 来自 `WTJ-20260704-035` 单图补齐；`house` 来自 `WTJ-20260704-036` 单图补齐；`igloo`、`insect`、`island` 来自 `WTJ-20260704-037` 单图补齐；`juice`、`jam`、`jar`、`jellyfish` 来自 `WTJ-20260704-038` 单图补齐；`koala`、`kettle` 来自 `WTJ-20260704-039` 单图补齐；`lion`、`lemon` 来自 `WTJ-20260704-040` 单图补齐；`milk`、`monkey` 来自 `WTJ-20260704-041` 单图补齐；`nest`、`nose`、`net`、`noodle` 来自 `WTJ-20260704-042` 单图补齐；`owl`、`octopus`、`oven` 来自 `WTJ-20260704-043` 单图补齐；`pear`、`pencil`、`pizza` 来自 `WTJ-20260704-044` 单图补齐；其余 24 个来自本卡三张新生成 sheet。

## 后续批次

- `batch-02`: 补齐 E-N 范围中缺口较多的常见物体。`alligator` 已由 `WTJ-20260704-033` 补齐，`eye`、`envelope` 已由 `WTJ-20260704-034` 补齐，`goat`、`gift`、`guitar` 已由 `WTJ-20260704-035` 补齐，`house` 已由 `WTJ-20260704-036` 补齐，`igloo`、`insect`、`island` 已由 `WTJ-20260704-037` 补齐，`juice`、`jam`、`jar`、`jellyfish` 已由 `WTJ-20260704-038` 补齐，`koala`、`kettle` 已由 `WTJ-20260704-039` 补齐，`lion`、`lemon` 已由 `WTJ-20260704-040` 补齐，`milk`、`monkey` 已由 `WTJ-20260704-041` 补齐，`nest`、`nose`、`net`、`noodle` 已由 `WTJ-20260704-042` 补齐；batch-02 当前小卡已补齐。
- `batch-03`: 补齐 O-W 主体词。`owl`、`octopus`、`oven` 已由 `WTJ-20260704-043` 补齐，`pear`、`pencil`、`pizza` 已由 `WTJ-20260704-044` 补齐；剩余包括 `queen`、`robot`、`rainbow`、`sun`、`tree`、`umbrella`、`van`、`violin` 等。
- `batch-04`: 补齐难字母和尾部词，含 `whale`、`watch`、`window`、`wagon`、`xylophone`、`xray`、`yoyo`、`yarn`、`yak`、`zebra`、`zipper`、`zucchini`。

pending 词在 `manifest.json` 中的 `asset_path` 指向 `stubs/secret-word-placeholder.png`，`intended_asset_path` 保留最终路径。开发可以先接入词库、判定、声音 key 和槽位逻辑；正式 sprite 补齐时只需要替换对应文件并把 `status` 改成 `ready`。

## 生成与取舍

- 使用内置 image generation 生成三张 #ff00ff chroma-key sheet；项目内保存源图后，用本地去背脚本转 alpha，再按 4x2 网格切出单体。
- `alligator` 使用内置 image generation 单图生成。因为主体为绿色，源图使用 #ff00ff chroma key，去背后保存为 `sprites/alligator.png`，提示词和取舍记录在 `source/alligator-prompt.md`。
- `eye`、`envelope` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/eye.png`、`sprites/envelope.png`，提示词和取舍记录在 `source/letter-e-prompt.md`。
- `goat`、`gift`、`guitar` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/goat.png`、`sprites/gift.png`、`sprites/guitar.png`，提示词和取舍记录在 `source/letter-g-prompt.md`。
- `house` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后保存为 `sprites/house.png`，提示词和取舍记录在 `source/letter-h-prompt.md`。
- `igloo`、`insect`、`island` 使用内置 image generation 单图生成，源图使用 #ff00ff chroma key，去背后分别保存为 `sprites/igloo.png`、`sprites/insect.png`、`sprites/island.png`，提示词和取舍记录在 `source/letter-i-prompt.md`。
- `juice`、`jar`、`jellyfish` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key；`jam` 使用 #ff00ff chroma key 以保留草莓叶，去背后分别保存为 `sprites/juice.png`、`sprites/jam.png`、`sprites/jar.png`、`sprites/jellyfish.png`，提示词和取舍记录在 `source/letter-j-prompt.md`。
- `koala`、`kettle` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/koala.png`、`sprites/kettle.png`，提示词和取舍记录在 `source/letter-k-prompt.md`。
- `lion`、`lemon` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/lion.png`、`sprites/lemon.png`，提示词和取舍记录在 `source/letter-l-prompt.md`。
- `milk`、`monkey` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/milk.png`、`sprites/monkey.png`，提示词和取舍记录在 `source/letter-m-prompt.md`。
- `nest`、`nose`、`net`、`noodle` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/nest.png`、`sprites/nose.png`、`sprites/net.png`、`sprites/noodle.png`，提示词和取舍记录在 `source/letter-n-prompt.md`。
- `owl`、`octopus`、`oven` 使用内置 image generation 单图生成，源图使用 #00ff00 chroma key，去背后分别保存为 `sprites/owl.png`、`sprites/octopus.png`、`sprites/oven.png`，提示词和取舍记录在 `source/letter-o-prompt.md`。
- `pear` 使用内置 image generation 单图生成，源图使用 #ff00ff chroma key；`pencil`、`pizza` 使用 #00ff00 chroma key，去背后分别保存为 `sprites/pear.png`、`sprites/pencil.png`、`sprites/pizza.png`，提示词和取舍记录在 `source/letter-p-prompt.md`。
- 第三张 sheet 是宽画布，但仍按实际尺寸 4x2 切片，没有强行拉伸。
- `flower`、`grapes`、`fish` 有轻微贴纸式白边；暗色画布上识别更强，且整体仍在 v3 soft-clay 风格内，本批标记为可接受。
- `icecream` 作为无空格秘密输入 token；显示名保留 `Ice cream`，声音 key 为 `secret.word.icecream`。
- `xray` 作为无连字符输入 token；显示名保留 `X-ray`。

## Prompts

### Sheet 01

```text
Use case: stylized-concept
Asset type: production secret-word sprite sheet for WorkTime Justin, a children's fullscreen desktop app.
Style reference: match the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance, top-left soft light, warm friendly saturation, no photorealism, no emoji, no flat vector icon.
Primary request: create exactly eight separate original secret-word object sprites: ant, airplane, banana, cup, cake, duck, drum, egg.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background only. Arrange in a clean 4 by 2 grid, one centered object per cell, generous padding. No labels, no text, no border, no frame, no shadows on the background, no floor plane.
Subject details: ant should be friendly simplified insect, airplane should be toy-like airplane, banana a single curved banana, cup a small rounded cup, cake a small slice or simple birthday cake without candles text, duck a yellow duck, drum a small child-friendly drum, egg a single white egg.
Quality constraints: production-quality finished illustration, readable on a dark navy app canvas at 96-240 px, consistent material and outline across all eight objects, clean edges for background removal, no watermark. Avoid using #ff00ff inside any object.
```

### Sheet 02

```text
Use case: stylized-concept
Asset type: production secret-word sprite sheet for WorkTime Justin, a children's fullscreen desktop app.
Style reference: match the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance, top-left soft light, warm friendly saturation, no photorealism, no emoji, no flat vector icon.
Primary request: create exactly eight separate original secret-word object sprites: elephant, fish, flower, frog, grapes, hat, heart, ice cream.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background only. Arrange in a clean 4 by 2 grid, one centered object per cell, generous padding. No labels, no text, no border, no frame, no shadows on the background, no floor plane.
Subject details: elephant should be a simplified friendly gray elephant, fish a bright toy-like fish, flower a simple flower bloom with stem, frog a friendly green frog, grapes a bunch of purple grapes, hat a simple child-friendly hat, heart a puffy red heart object, ice cream a cone with one scoop.
Quality constraints: production-quality finished illustration, readable on a dark navy app canvas at 96-240 px, consistent material and outline across all eight objects, clean edges for background removal, no watermark. Avoid using #ff00ff inside any object.
```

### Sheet 03

```text
Use case: stylized-concept
Asset type: production secret-word sprite sheet for WorkTime Justin, a children's fullscreen desktop app.
Style reference: match the WorkTime Justin v3 production sprite style: polished 2.5D soft-plastic / soft-clay children's app illustration, rounded geometry, refined matte shading, crisp silhouette, subtle bevels, medium-thick soft outline, unified 3/4 front perspective, same camera distance, top-left soft light, warm friendly saturation, no photorealism, no emoji, no flat vector icon.
Primary request: create exactly eight separate original secret-word object sprites: key, kite, leaf, moon, mouse, orange, pig, rocket.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background only. Arrange in a clean 4 by 2 grid, one centered object per cell, generous padding. No labels, no text, no border, no frame, no shadows on the background, no floor plane.
Subject details: key should be a golden key, kite a colorful diamond kite with short tail, leaf a single green leaf, moon a yellow crescent moon object, mouse a friendly small gray mouse animal, orange a round orange fruit with leaf, pig a simplified pink pig, rocket a toy-like red and white rocket.
Quality constraints: production-quality finished illustration, readable on a dark navy app canvas at 96-240 px, consistent material and outline across all eight objects, clean edges for background removal, no watermark. Avoid using #ff00ff inside any object.
```

## 自检

- `manifest.json` 共 100 个词；67 个 `ready`，33 个 `pending_sprite_stubbed`。
- 67 个 ready sprite 加 placeholder 均为 `1024x1024 RGBA`。
- 四角 alpha 均为 0。
- 可见像素中无 #ff00ff / #00ff00 色键残留。
- `manifest.json` 中所有 `asset_path` 均存在，pending 词指向 placeholder，ready 词指向真实 sprite。
- 暗底接触表已检查：主体完整、无明显截断、无相邻格碎片、儿童可识别。
