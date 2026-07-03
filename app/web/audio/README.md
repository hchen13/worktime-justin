# `app/web/audio/`

对应飞书卡：`WTJ-20260704-016`（实现音频/TTS/SFX 管理与缓存）。

本目录是 `app/web/audio.js`（`window.WTJ_AUDIO` manager）的配套文档与数据文件。
本目录及 `app/web/audio.js` 是本卡的全部交付物；**不包含任何真实音频文件**——
运行时素材目录（`audio/words/`、`audio/tasks/`、`audio/sfx/`、`audio/phrases/`）
本身尚不存在，均为路径约定，真实素材由后续授权采购卡交付。

## 目录内容

| 文件 | 内容 |
|---|---|
| `AUDIO-API.md` | `window.WTJ_AUDIO` 完整 API 文档：方法签名、路径约定、缓存策略、降级契约、各消费卡（009/011/013/019）怎么用。**先看这份。** |
| `sfx-manifest.json` | SFX 键值清单：`sfxKey -> { path, category, purpose, reqIds }`，覆盖 REQ-AST-09 点名的动物叫声 / 铃铛 / 水声 / 开箱声四类，另加通用 UI 反馈音。与 `audio.js` 内部的 `DEFAULT_SFX_MAP` 常量保持同步（运行时不 fetch 本文件，理由见该文件内 `$schema_note`）。 |
| `missing-audio.json` | 授权/来源缺口清单：秘密词语音（对齐 Pack B 100 词范围）、SFX、任务语音、组合短语四段，逐条标注 `status: "not-delivered"` 与所需授权/制作说明，供 PM/DESIGN 排期采购。 |

## 快速上手

```js
// 1. 加载 manager（本卡未接入 index.html，以下为未来 019 集成卡的接入示例）
// <script src="audio.js"></script>

// 2. 在首次用户手势里解锁 AudioContext
document.addEventListener('click', function once() {
  document.removeEventListener('click', once);
  WTJ_AUDIO.unlock();
}, { once: true });

// 3. 播放
WTJ_AUDIO.playWord('dog');
WTJ_AUDIO.playSfx('chest-open');
WTJ_AUDIO.playTaskVoice(WTJ_MANIFEST.tasks.templates.press.examples[0]);
WTJ_AUDIO.playComposite([{ type: 'phrase', key: 'find' }, { type: 'word', key: 'dog' }]);
```

以上调用当前会全部 silent 降级（不抛错，`console.warn` 一次，记录进
`WTJ_AUDIO.getMissingReport()`）——这是设计好的行为，详见 `AUDIO-API.md` 第 5 节
「降级契约」，013 等消费方可以据此把 `WTJ_AUDIO` 直接当 silent/mock adapter 提前接入，
不需要等真实音频文件。

注意：仅仅"把真实 `.m4a` 放到约定路径"**还不足以出声**——本项目既定的 WKWebView
`loadFileURL` 运行时会拦截 `fetch()` 对 `file:` 资源的读取，019 集成卡必须替换
`audio.js` 的加载层（`loadArrayBuffer`）才能真正播放。详见 `AUDIO-API.md` 第 6 节
第 3 条。

完整 API、路径约定、缓存策略（LRU 上限依据）、`speechSynthesis` 红线说明、
各消费卡对照表，见 `AUDIO-API.md`。缺口统计与授权采购说明见 `missing-audio.json`
顶部 `summary` / `licensingGapStatement` 字段。
