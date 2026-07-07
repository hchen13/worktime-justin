# app/web/assets/sprites/ — 素材来源追溯（PROVENANCE）

本目录下共 **101 个 PNG**（= 100 个 ready sprite + 1 个共享占位图
`secret-word-placeholder.png`），全部是**运行时集成副本**：从 DESIGN 交付并已验收的素材包直接
`cp` 复制而来，文件名与源交付路径保持一致，未做任何像素级修改（不裁剪、不压缩、不改格式、不改
分辨率）。复制前后逐一用 `md5` 核对校验和一致（见下表）。分两批集成：

1. **首批 8 个**（卡 WTJ-20260703-007 → WTJ-20260704-009 集成，v3 生产基准）——见下方「复制清单
   （首批 8 词，WTJ-20260704-009 集成）」。
2. **第二批 92 个 ready sprite + 1 个共享占位图**（卡 WTJ-20260704-006 Pack B 生产词池 →
   本卡 WTJ-20260704-019 第二批集成）——见下方「复制清单（Pack B 词池扩展，WTJ-20260704-019
   第二批集成）」。

100 个 ready sprite = 首批 8 个 v3 baseline（含 7 个与 Pack B 重名、继续沿用 v3 baseline 的词
+ treasure-chest）+ 第二批 92 个 Pack B ready sprite（2026-07-06 起 `fox` 替代 `xray`，且
`xylophone` 已从运行词池移除）。活跃 Pack B 已产出完毕，**不再有 stub 词**；共享占位图
`secret-word-placeholder.png` 现已无 pool 条目引用，作为"未来若有新 stub 词可复用"的备用素材
保留（不被运行时加载，也不计入 100 个 ready sprite）。

## 复制清单（首批 8 词，WTJ-20260704-009 集成）

| 运行时路径 | 源路径 | 素材卡号 | REQ ID | 复制日期 | md5 |
|---|---|---|---|---|---|
| `app/web/assets/sprites/dog.png` | `docs/assets/sprites/dog.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `480d9d4b955a60d0a2fd1046e3f93b4f` |
| `app/web/assets/sprites/cat.png` | `docs/assets/sprites/cat.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `20d86921be108864366062ecab3e1270` |
| `app/web/assets/sprites/apple.png` | `docs/assets/sprites/apple.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `90ad2555e3acaf032b30cf31d5edb042` |
| `app/web/assets/sprites/ball.png` | `docs/assets/sprites/ball.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `329e2b8f0e0c1f864f0c111ba7f1d25f` |
| `app/web/assets/sprites/star.png` | `docs/assets/sprites/star.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `d0835faeffedf4d741e3abdb422be3b4` |
| `app/web/assets/sprites/car.png` | `docs/assets/sprites/car.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `1e03a4ae2dce95ac5ade0d9f0cd844bf` |
| `app/web/assets/sprites/basket.png` | `docs/assets/sprites/basket.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `bf179b7c3308e79ad2652087721a682f` |
| `app/web/assets/sprites/treasure-chest.png` | `docs/assets/sprites/treasure-chest.png` | WTJ-20260703-007 | REQ-AST-12 | 2026-07-04 | `92fa4ff18fcd6d138b141c4a9c112b74` |

规格（引自 `docs/index.html` `#assets` / `#sprite-contact-sheet`）：PNG / RGBA / 1024×1024 /
透明背景，v3 生产基准（已验收，commit `8cc540f`）。这 8 个文件与
`app/web/manifest.js` 的 `secretWords.pool[].spriteFile` 逐一对应（`treasurechest` 词对应的
文件名是 `treasure-chest.png`，含连字符，manifest 里已按此正确拼写引用，不要在新增词池条目时
误写成 `treasurechest.png`）。

## 复制清单（Pack B 词池扩展，WTJ-20260704-019 第二批集成）

源：`docs/assets/production-pack-b/`（卡 WTJ-20260704-006，DESIGN 交付，`manifest.json` +
`missing-assets.json` 描述的 100 词生产词池）。**Pack B 是活数据源，本卡执行期间持续演进，现已
产出完毕**：两个源 json 的 `updated_at_cst` 从任务交接时的 `2026-07-04 09:54` 一路更新到本次
narrow refresh 的 `2026-07-04 10:58`——`yoyo`/`yarn`/`yak`（batch-04）、最后 `zebra`/`zipper`/`zucchini`（卡 WTJ-20260704-054，PM
已验收）陆续从 stub 转为 ready，均已落地。2026-07-06 fox 替换后，**以最新活跃验收状态为准**：
`production_ready_count=99`、`stubbed_pending_count=0`（Pack B 活跃验收词全部 ready，**不再有 stub 词**）。

2026-07-06 追加裁定：旧 X 起始词 `xylophone`/`xray` 不再进入运行词池，改用结尾 x 词 `fox`
（WTJ-20260706-015）。运行时 Pack B 活跃新拷贝文件为 92 个，`fox.png` 替换 `xray.png`；
`xylophone` 已不在运行目录内。

**7 个与首批 8 词重名的词（dog/cat/apple/ball/star/car/basket）不在本次复制范围内**——Pack B
对这 7 个词重新生成了一版不同的 sprite（md5 与已验收的 v3 baseline 不同，逐一核对过），但本卡
按"以已验收为准，避免重复/冲突"的原则，`secretWords.pool` 里这 7 个词继续引用上一节列出的、
已验收且已被 009 单测覆盖的 v3 baseline 文件，Pack B 对应的重生成版本没有被拷贝进本目录（仍只
停留在 `docs/assets/production-pack-b/sprites/` 供参考）。下表列出真正新拷贝进本目录的 92 个
Pack B 文件（85 个首次集成 + 后补的 fox/yoyo/yarn/yak/zebra/zipper/zucchini 7 个）
+ 1 个共享占位图（现已无 pool 引用，见占位图行注释）。

| 运行时路径 | 源路径 | md5 |
|---|---|---|
| `app/web/assets/sprites/ant.png` | `docs/assets/production-pack-b/sprites/ant.png` | `cbe581a12fe30044bea32af289d4289a` |
| `app/web/assets/sprites/airplane.png` | `docs/assets/production-pack-b/sprites/airplane.png` | `32f10a957631db39acc24940be143c7d` |
| `app/web/assets/sprites/alligator.png` | `docs/assets/production-pack-b/sprites/alligator.png` | `09c4c4050bc0647dafe29c896faf84f5` |
| `app/web/assets/sprites/bell.png` | `docs/assets/production-pack-b/sprites/bell.png` | `0a307de04ae923ed1ae20fd703af6c61` |
| `app/web/assets/sprites/banana.png` | `docs/assets/production-pack-b/sprites/banana.png` | `bdb3a7d1efe3c0bfbaac97566abb03f8` |
| `app/web/assets/sprites/cup.png` | `docs/assets/production-pack-b/sprites/cup.png` | `76227cc204ac72b72a042263f52484db` |
| `app/web/assets/sprites/cake.png` | `docs/assets/production-pack-b/sprites/cake.png` | `fe70770345fd56b570607f56c7be1066` |
| `app/web/assets/sprites/door.png` | `docs/assets/production-pack-b/sprites/door.png` | `4739dfc2066cd8e30e2df8d14525e0bb` |
| `app/web/assets/sprites/duck.png` | `docs/assets/production-pack-b/sprites/duck.png` | `bef33987f627c72f678934446d57079f` |
| `app/web/assets/sprites/drum.png` | `docs/assets/production-pack-b/sprites/drum.png` | `84a27b6faae6f82b2588cb05651f99d8` |
| `app/web/assets/sprites/egg.png` | `docs/assets/production-pack-b/sprites/egg.png` | `48041cf141f5c941030a61175ec190a7` |
| `app/web/assets/sprites/elephant.png` | `docs/assets/production-pack-b/sprites/elephant.png` | `52c5f6c467e76839766f40d0c4ef2858` |
| `app/web/assets/sprites/eye.png` | `docs/assets/production-pack-b/sprites/eye.png` | `afe762ff4c8330b70f813534adfda556` |
| `app/web/assets/sprites/envelope.png` | `docs/assets/production-pack-b/sprites/envelope.png` | `c5885aab5941fd3e6d6dc2628546c552` |
| `app/web/assets/sprites/fish.png` | `docs/assets/production-pack-b/sprites/fish.png` | `b5d40afafefcb9064a28bf0021e49178` |
| `app/web/assets/sprites/flower.png` | `docs/assets/production-pack-b/sprites/flower.png` | `88966c2919c29e00be8e0c80da2baf09` |
| `app/web/assets/sprites/frog.png` | `docs/assets/production-pack-b/sprites/frog.png` | `e854ad2153da7d6a9d75f5b046c4e08f` |
| `app/web/assets/sprites/faucet.png` | `docs/assets/production-pack-b/sprites/faucet.png` | `6cc33a206f27ccf4173870a49e9ab294` |
| `app/web/assets/sprites/goat.png` | `docs/assets/production-pack-b/sprites/goat.png` | `0b37c66ab8e6c0334982b20ca3c637ba` |
| `app/web/assets/sprites/grapes.png` | `docs/assets/production-pack-b/sprites/grapes.png` | `6c99f12ad9faa4c66aefb7fdbf22c3c1` |
| `app/web/assets/sprites/gift.png` | `docs/assets/production-pack-b/sprites/gift.png` | `dc438e109a0f73713b3a06f1ac918d4e` |
| `app/web/assets/sprites/guitar.png` | `docs/assets/production-pack-b/sprites/guitar.png` | `02965b801364f1120f50f6a435707b10` |
| `app/web/assets/sprites/horse.png` | `docs/assets/production-pack-b/sprites/horse.png` | `839d554eb2935150bced6084fbe8d5b7` |
| `app/web/assets/sprites/hat.png` | `docs/assets/production-pack-b/sprites/hat.png` | `4bb41473c366628ba7e7fe71399177f2` |
| `app/web/assets/sprites/heart.png` | `docs/assets/production-pack-b/sprites/heart.png` | `cd1bedeffd6be17662cf7db7565d6a2e` |
| `app/web/assets/sprites/house.png` | `docs/assets/production-pack-b/sprites/house.png` | `1feec224a2bcb732e0cdb990517bb95d` |
| `app/web/assets/sprites/icecream.png` | `docs/assets/production-pack-b/sprites/icecream.png` | `ffd437ffde106a8deb841a014d5c5291` |
| `app/web/assets/sprites/igloo.png` | `docs/assets/production-pack-b/sprites/igloo.png` | `2ec7ab67a950e4233b77288d32bb9eae` |
| `app/web/assets/sprites/insect.png` | `docs/assets/production-pack-b/sprites/insect.png` | `5ea9756bda6d33682361a6cdc98ca78d` |
| `app/web/assets/sprites/island.png` | `docs/assets/production-pack-b/sprites/island.png` | `a6ecf0fc5069dbe93e3be73dadf28552` |
| `app/web/assets/sprites/juice.png` | `docs/assets/production-pack-b/sprites/juice.png` | `e1962222a11cd8ef9b6ad17b2344a632` |
| `app/web/assets/sprites/jam.png` | `docs/assets/production-pack-b/sprites/jam.png` | `d03c833341382f08f28fcb774b28bef2` |
| `app/web/assets/sprites/jar.png` | `docs/assets/production-pack-b/sprites/jar.png` | `e268e0458e2d380952b502f372d19b57` |
| `app/web/assets/sprites/jellyfish.png` | `docs/assets/production-pack-b/sprites/jellyfish.png` | `74d70dc30c2d5bb8d98ca0baebaee1f7` |
| `app/web/assets/sprites/key.png` | `docs/assets/production-pack-b/sprites/key.png` | `bbf94b622712d7f76d421f390f252f62` |
| `app/web/assets/sprites/kite.png` | `docs/assets/production-pack-b/sprites/kite.png` | `aa39981a4cd4474b56fc5d18f5654927` |
| `app/web/assets/sprites/koala.png` | `docs/assets/production-pack-b/sprites/koala.png` | `d967ee37dfc11b0e6b6a3ab1d81fdc5a` |
| `app/web/assets/sprites/kettle.png` | `docs/assets/production-pack-b/sprites/kettle.png` | `a7e187f456e6ddd44c41cec3a3c366f3` |
| `app/web/assets/sprites/lamp.png` | `docs/assets/production-pack-b/sprites/lamp.png` | `cf224b8728bbf2a9d21eaf5724d90f0a` |
| `app/web/assets/sprites/leaf.png` | `docs/assets/production-pack-b/sprites/leaf.png` | `a010998448f7c8ee888ae778d5280822` |
| `app/web/assets/sprites/lion.png` | `docs/assets/production-pack-b/sprites/lion.png` | `09e8a69a4a9441e32e1e1ef6184d1a27` |
| `app/web/assets/sprites/lemon.png` | `docs/assets/production-pack-b/sprites/lemon.png` | `03c7c4e4bb80470b950b953a16e9bb34` |
| `app/web/assets/sprites/moon.png` | `docs/assets/production-pack-b/sprites/moon.png` | `59e4233490e4b646ceb9ae2bd3cba8c9` |
| `app/web/assets/sprites/mouse.png` | `docs/assets/production-pack-b/sprites/mouse.png` | `57a4a6cc3b78800c82ba67663a9bff77` |
| `app/web/assets/sprites/milk.png` | `docs/assets/production-pack-b/sprites/milk.png` | `373eab52c5f2b8fbc4d666f9bef786b6` |
| `app/web/assets/sprites/monkey.png` | `docs/assets/production-pack-b/sprites/monkey.png` | `46c05e76ae914c42a6f26c3e80b73775` |
| `app/web/assets/sprites/nest.png` | `docs/assets/production-pack-b/sprites/nest.png` | `c609e992770d81135c7969e808998c0e` |
| `app/web/assets/sprites/nose.png` | `docs/assets/production-pack-b/sprites/nose.png` | `b549c845574f8d3db48ff253d43a981c` |
| `app/web/assets/sprites/net.png` | `docs/assets/production-pack-b/sprites/net.png` | `6b38c55d92a36430c41595250abd87c6` |
| `app/web/assets/sprites/noodle.png` | `docs/assets/production-pack-b/sprites/noodle.png` | `cb39363af9352e3601724e7f4edb86a3` |
| `app/web/assets/sprites/orange.png` | `docs/assets/production-pack-b/sprites/orange.png` | `68bf79e5c860caff47178adfd24d33b9` |
| `app/web/assets/sprites/owl.png` | `docs/assets/production-pack-b/sprites/owl.png` | `7b1841b7e6572a07cc424fe6d7ea8abb` |
| `app/web/assets/sprites/octopus.png` | `docs/assets/production-pack-b/sprites/octopus.png` | `e10eaff87048d7088957233875ae7ca8` |
| `app/web/assets/sprites/oven.png` | `docs/assets/production-pack-b/sprites/oven.png` | `d97188c520e8197d5bc3555cbd819fa2` |
| `app/web/assets/sprites/pig.png` | `docs/assets/production-pack-b/sprites/pig.png` | `884a166f6213e15323e4857d1d0b09d1` |
| `app/web/assets/sprites/pear.png` | `docs/assets/production-pack-b/sprites/pear.png` | `db68aba79927dd13070352d030e903b0` |
| `app/web/assets/sprites/pencil.png` | `docs/assets/production-pack-b/sprites/pencil.png` | `74584a7c5352aaf053a025bd9488aa8a` |
| `app/web/assets/sprites/pizza.png` | `docs/assets/production-pack-b/sprites/pizza.png` | `31d990f7b7b3a724a7eabf72aace2229` |
| `app/web/assets/sprites/queen.png` | `docs/assets/production-pack-b/sprites/queen.png` | `b5286d46ac2bfc8b7322ae4080bdc7ca` |
| `app/web/assets/sprites/quilt.png` | `docs/assets/production-pack-b/sprites/quilt.png` | `a83467dd4c54e553363ddb77c9d44149` |
| `app/web/assets/sprites/quail.png` | `docs/assets/production-pack-b/sprites/quail.png` | `47e78a0ce08390c37f2092adb1603181` |
| `app/web/assets/sprites/quarter.png` | `docs/assets/production-pack-b/sprites/quarter.png` | `b3d3e08a4824872968bd458c2dd999ee` |
| `app/web/assets/sprites/rocket.png` | `docs/assets/production-pack-b/sprites/rocket.png` | `3512b72201be261821d5ffea163f0340` |
| `app/web/assets/sprites/robot.png` | `docs/assets/production-pack-b/sprites/robot.png` | `8b71f8f8bf2471cacf994dbccbcd4324` |
| `app/web/assets/sprites/rainbow.png` | `docs/assets/production-pack-b/sprites/rainbow.png` | `ac0a27f2d37a12206979e6851ba1c972` |
| `app/web/assets/sprites/ring.png` | `docs/assets/production-pack-b/sprites/ring.png` | `5bec07762233301ee510f3caab0e8e95` |
| `app/web/assets/sprites/sun.png` | `docs/assets/production-pack-b/sprites/sun.png` | `60cac603a642f4b89a97bbc9ff06da16` |
| `app/web/assets/sprites/shoe.png` | `docs/assets/production-pack-b/sprites/shoe.png` | `12f3b85f6d0cf3c968aa72445ad982a8` |
| `app/web/assets/sprites/spoon.png` | `docs/assets/production-pack-b/sprites/spoon.png` | `93123b006a7d258f7e2d37ff5cdb8d57` |
| `app/web/assets/sprites/treasure.png` | `docs/assets/production-pack-b/sprites/treasure.png` | `92fa4ff18fcd6d138b141c4a9c112b74` |
| `app/web/assets/sprites/tree.png` | `docs/assets/production-pack-b/sprites/tree.png` | `09398bf2bad16c30792d4477b0ad194a` |
| `app/web/assets/sprites/train.png` | `docs/assets/production-pack-b/sprites/train.png` | `18d8d82e6175062691fef792074e4f87` |
| `app/web/assets/sprites/turtle.png` | `docs/assets/production-pack-b/sprites/turtle.png` | `e0e0e4c7e9b38d5b3e0bb8e8777053ff` |
| `app/web/assets/sprites/umbrella.png` | `docs/assets/production-pack-b/sprites/umbrella.png` | `f3434a52d67d439b669298cedd32a524` |
| `app/web/assets/sprites/unicorn.png` | `docs/assets/production-pack-b/sprites/unicorn.png` | `bdafa36490cee30db55282e2eef74d0c` |
| `app/web/assets/sprites/ukulele.png` | `docs/assets/production-pack-b/sprites/ukulele.png` | `67c6fcc666ebc6ed2e3e3b25315a7462` |
| `app/web/assets/sprites/uniform.png` | `docs/assets/production-pack-b/sprites/uniform.png` | `b0f8e30744c959797ff78a80bd5ad472` |
| `app/web/assets/sprites/van.png` | `docs/assets/production-pack-b/sprites/van.png` | `04517355e4321246d829559d007b5c99` |
| `app/web/assets/sprites/vase.png` | `docs/assets/production-pack-b/sprites/vase.png` | `7d7b52aca851d905822bd8f875c0d0b0` |
| `app/web/assets/sprites/violin.png` | `docs/assets/production-pack-b/sprites/violin.png` | `c54bd60dfa2c2df2940184c81c6962e9` |
| `app/web/assets/sprites/volcano.png` | `docs/assets/production-pack-b/sprites/volcano.png` | `5b7841f3ec7cee0b0b7d00b875d3a371` |
| `app/web/assets/sprites/whale.png` | `docs/assets/production-pack-b/sprites/whale.png` | `e1c0816dd53fb557f6b9d2c5682d2b0a` |
| `app/web/assets/sprites/watch.png` | `docs/assets/production-pack-b/sprites/watch.png` | `901741d15516a09b866059d33256e8b6` |
| `app/web/assets/sprites/window.png` | `docs/assets/production-pack-b/sprites/window.png` | `509561f53c602b6a524cdd6147b1d345` |
| `app/web/assets/sprites/wagon.png` | `docs/assets/production-pack-b/sprites/wagon.png` | `b46059f49d33acb7e808eb368262321c` |
| `app/web/assets/sprites/fox.png` | `docs/assets/production-pack-b/sprites/fox.png` | `56c6fd616e048d03b1079df35f123468` |
| `app/web/assets/sprites/yoyo.png` | `docs/assets/production-pack-b/sprites/yoyo.png` | `0fd07e2368b53332df1f8f208ddc2e36` |
| `app/web/assets/sprites/yarn.png` | `docs/assets/production-pack-b/sprites/yarn.png` | `3e022e283833a62e98bd898d98c8a0cd` |
| `app/web/assets/sprites/yak.png` | `docs/assets/production-pack-b/sprites/yak.png` | `74d5667b12630e9d408ad3d3c1201e25` |
| `app/web/assets/sprites/zebra.png` | `docs/assets/production-pack-b/sprites/zebra.png` | `eddeb81f15cad31526a8c9144b7a192f` |
| `app/web/assets/sprites/zipper.png` | `docs/assets/production-pack-b/sprites/zipper.png` | `ae26089d107562c44cbfec519afa9aff` |
| `app/web/assets/sprites/zucchini.png` | `docs/assets/production-pack-b/sprites/zucchini.png` | `ed002bf1e68444edd1c17ad25333d5e1` |
| `app/web/assets/sprites/secret-word-placeholder.png` | `docs/assets/production-pack-b/stubs/secret-word-placeholder.png` | `accc2417ff7a3efe073a0abcca710fbb`（共享占位图。活跃 Pack B sprite 全部产出后，**已无任何 pool 条目引用此文件**——保留在目录里作为"未来若有新 stub 词可复用"的备用素材，不被运行时加载，也不计入 100 个 ready sprite；`tests/unit/secretword-pool-integrity.test.mjs` 用例 10 的双向计数断言将其列为已知白名单孤儿） |

规格：与首批 8 个同规格（PNG / RGBA / 1024×1024 / 透明背景，2.5D soft-plastic 儿童插画风格），
引自 `docs/assets/production-pack-b/manifest.json` 的 `style_baseline` 字段。

**有趣的既成事实（据实记录）**：`treasure.png`（Pack B 正式词 `treasure`）与已验收的
`treasure-chest.png`（v3 baseline，遗留词 `treasurechest`）md5 完全相同
（`92fa4ff18fcd6d138b141c4a9c112b74`）——两张图像素级一致，只是被两个不同的词各自引用。这不影响
功能（`secretWords.pool` 里 `treasure` 与 `treasurechest` 是两个独立词条，命中判定各自独立，见
`tests/unit/secretword-engine.test.mjs` 用例 14 对 `TREASURECHEST` 复合触发行为的断言），仅在此
如实记录，供 PM/DESIGN 知悉这两个词未来是否需要视觉区分。

## 运行时路径约定与已知偏离（需 PM/TL 关注）

`app/web/manifest.js` 的 `assets.runtimeDirs.sprites` 字段声明的运行时约定是 `'sprites/'`
（相对 `app/web/`，即最终期望路径形如 `app/web/sprites/dog.png`），`secretWords.pool[].spriteFile`
字段也确实写成 `'sprites/dog.png'` 这种不带 `assets/` 前缀的形式。但本卡（WTJ-20260704-009）
收到的 TL 架构指令明确要求把 sprite 复制到 **`app/web/assets/sprites/`**（与 007 卡
`app/web/assets/ui/` 的既有先例一致），而不是 `app/web/sprites/`。

这与 `manifest.js` 里 `spriteFile` 字段字面值存在一层路径前缀差异——如果 `secretword.js` 直接把
`spriteFile`（如 `'sprites/dog.png'`）原样喂给 `<img src>` 或 `WTJ_HUD.setSlot({ spriteUrl })`，
在浏览器里会解析成 `app/web/sprites/dog.png`，而实际文件位于
`app/web/assets/sprites/dog.png`，会 404。

**本卡的处理方式**：`secretword.js` 内部有一个 `resolveSpritePath()` 函数，统一把
`spriteFile` 拼接上 `'assets/'` 前缀后再用于 DOM `<img src>` 与 `WTJ_HUD.setSlot()` 调用
（见 `secretword.js` 文件头「素材路径解析」一节的详细说明）。这是本卡范围内的最小修正，
**没有改动 `manifest.js` 本身**（改 manifest 不改代码是既定原则，但这次是反过来——本卡选择在
消费端做路径映射，而不是去改 `manifest.js` 的 `runtimeDirs`/`spriteFile` 约定，因为
`manifest.js` 明确标注为只读参考、不在本卡改动范围内）。

遗留问题，需 PM/TL 后续裁决其中一种方案统一掉这个不一致：
1. 把 `manifest.js` 的 `assets.runtimeDirs.sprites` 改成 `'assets/sprites/'`、`pool[].spriteFile`
   一并改成 `'assets/sprites/dog.png'` 这种带前缀的写法，与 `assets/ui/` 保持同一约定；或
2. 未来集成卡把 sprite 实际迁移到 `app/web/sprites/`（与 `manifest.js` 现有字面值一致），
   届时应同步删除本目录并更新 `secretword.js` 的 `resolveSpritePath()`，去掉 `'assets/'` 前缀拼接。

**本卡（WTJ-20260704-019 第二批）的裁决**：沿用方案不变——继续把 Pack B 新增的 92 个 sprite
拷贝进 `app/web/assets/sprites/`（与首批 8 个同目录），`manifest.js` 里新词条目的 `spriteFile`
字面值继续写不带 `assets/` 前缀的 `'sprites/xxx.png'`，靠 `secretword.js` 现有的
`resolveSpritePath()` 统一补前缀。**没有**把 sprite 迁移到 `app/web/sprites/`（选项 2），也
**没有**改 `manifest.js` 的 `runtimeDirs`/`spriteFile` 前缀写法（选项 1）——这两个选项都涉及
100 处词池条目路径写法或改动 `secretword.js`，超出本卡"只动 manifest.js 数据行 + 拷贝素材"的
范围（且被明确要求不改 009 `secretword.js`）。上述两个方案仍然是需要 PM/TL 后续统一裁决的遗留
选择，本卡只是继续沿用 009 已经跑通的现状，不代表方案 1/2 已被否决。

在这层统一之前，任何新代码直接使用 `manifest.secretWords.pool[].spriteFile` 拼 DOM 路径时，都
应该复用 `secretword.js` 的 `resolveSpritePath()`（或等价逻辑），不要各自重新硬编码前缀。

## 集成范围

首批（WTJ-20260704-009）只消费 `secretWords.pool` 引用的 8 个 sprite；第二批
（WTJ-20260704-019）把词池同步扩展并经 2026-07-06 fox 替换后，本目录当前共 100 个 ready sprite + 1 个
共享占位图（合计 101 个 PNG）。100 个 ready sprite 均用于同一套既有机制：命中反馈 sprite 叠层
（`secretword.js` 的 `showSpriteOverlay()`）
与五槽点亮图标（`WTJ_HUD.setSlot(index, { spriteUrl })`）——这两个消费路径本身未被本卡改动，
词池数据扩大后自动对新词生效（`secretword.js` 遍历 `pool` 而非逐词写 if/else，见
`app/web/MANIFEST.md`「新增词池条目的步骤」第 5 条）。共享占位图 `secret-word-placeholder.png`
现已无 pool 条目引用（活跃 Pack B sprite 全 ready 后不再有 stub），不被运行时消费，仅作备用素材保留。

## 遗留事项（明确不在本卡处理）

- **统一素材管线**：与 `app/web/assets/PROVENANCE.md` 记录的同一遗留问题——当前是手动
  `cp`/脚本批量复制 + 人工核对 md5，没有构建期自动化同步。活跃 Pack B 本批已产出并落地，
  但这套"手动复制 + 更新 `manifest.js` + 追加本文件记录"的流程本身仍未自动化，未来若有新词包
  仍需人工重复，值得后续卡评估建管线。
- **Pack B stub 缺口已清零（历史记录）**：本卡执行期间 DESIGN 分批把 X/Y/Z 组从 stub 补齐为
  ready——`yoyo`/`yarn`/`yak`（batch-04）、最后 `zebra`/`zipper`/`zucchini`（卡 WTJ-20260704-054，PM 已验收）。
  2026-07-06 追加：`fox`（WTJ-20260706-015）替代 `xray`，`xylophone`/`xray` 不再作为运行词池条目。现场核对
  `docs/assets/production-pack-b/missing-assets.json`（`updated_at_cst: 2026-07-06 21:05`）：
  `missing_count: 0`，活跃 Pack B sprite **全部 ready，无 stub**。共享占位图
  `secret-word-placeholder.png` 已无 pool 引用，保留为备用素材（见「集成范围」一节）。
- **`basket` / `treasurechest` 词池归属（PM 已裁决保留）**：见 `app/web/MANIFEST.md`
  「已知的文档/素材对齐问题」一节——这两个词最初是为了满足"首批 8 词对应已验收 sprite"而选用，
  `docs/index.html` `#secret` 章节给出的示例词标签是
  `dog / cat / apple / ball / moon / star / car / zoo`。本卡（019 第二批）扩展并经 fox 替换后：
  `moon` 已在 Pack B M 组正式补齐为秘密词、`basket` 已确认是 Pack B 正式成员（B 组）。
  **PM 已裁决保留 `treasure` 与 `treasurechest` 两个词**（二者共享同一 md5 的 sprite
  `treasure.png`/`treasure-chest.png` 作为 token；`treasurechest` 是 004/009 遗留、非 Pack B 词，
  但获准正式保留，不删除）。仅剩 `zoo` 仍无对应词（Pack B 未提供），如实记录，非本卡范围。
- **性能优化留给 018 卡**：直接使用 1024×1024 原图，不做降采样/裁剪/雪碧图合并，页面通过 CSS
  控制显示尺寸（sprite 叠层约 96–200px，见 `secretword.css`）。当前运行时词池为 100 个可用
  secret-word sprite（活跃 Pack B 99 个 + legacy `treasurechest`），其中 `fox.png` 已替代旧
  `xray.png`；磁盘目录保留 101 个 PNG（含 `secret-word-placeholder.png` 备用占位图）。这些 sprite
  同样未做任何降采样/裁剪/合并处理，相对 `performance.maxResidentSprites`
  （20，见 `app/web/manifest.js`）的红线关系留给 018 卡评估（当前秘密词命中是一次一个 sprite
  叠层出现后即移除，非同时常驻 100 张，但 018 卡应确认这条假设在真实播放路径下成立）。
