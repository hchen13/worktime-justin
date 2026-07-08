#!/usr/bin/env bash
#
# build.sh — WorkTime Justin 构建脚本（WTJ-20260704-002）
#
# 用法: ./build.sh [--run]
#
# 交叉编译 x86_64 + arm64 两个 slice，lipo 合成 universal 二进制，组装
# .app bundle，ad-hoc 签名，打包 .dmg，并在构建后自动验证关键约束
# （universal archs、双 slice 最低部署版本、并发硬门禁、签名有效性）。
#
set -euo pipefail

APP_NAME="WorkTimeJustin"
BUNDLE_ID="com.worktime.justin"
VERSION="1.0.0"
MIN_OS="11.0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# WTJ-20260705-017：构建期采集 git commit，写入 Info.plist（下方 WTJBuildCommit 键），供
# main.swift 的诊断日志头 + 注入给 web 层的 window.__WTJ_BUILD_INFO 使用（见
# app/web/diag.js「app 版本/commit」一节）。仓库不可用（例如从 tarball 而非 git checkout
# 构建）时优雅回退 "unknown"，不让构建因此失败——commit 号是诊断辅助信息，不是构建的
# 必要前提条件。
GIT_COMMIT="$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
echo "==> 记录 git commit: ${GIT_COMMIT}"

DIST_DIR="$SCRIPT_DIR/dist"
BUILD_DIR="$SCRIPT_DIR/.build-tmp"
APP_BUNDLE="$DIST_DIR/${APP_NAME}.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
DMG_PATH="$DIST_DIR/${APP_NAME}.dmg"

RUN_AFTER_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --run) RUN_AFTER_BUILD=1 ;;
    *)
      echo "未知参数: $arg" >&2
      echo "用法: ./build.sh [--run]" >&2
      exit 1
      ;;
  esac
done

echo "==> 清理 dist/ 与临时构建目录（脚本可重复执行）"
rm -rf "$DIST_DIR" "$BUILD_DIR"
mkdir -p "$DIST_DIR" "$BUILD_DIR" "$MACOS_DIR" "$RESOURCES_DIR"

echo "==> 定位 macOS SDK"
SDK=$(xcrun --sdk macosx --show-sdk-path)
echo "    SDK=$SDK"

X64_BIN="$BUILD_DIR/${APP_NAME}-x86_64"
ARM64_BIN="$BUILD_DIR/${APP_NAME}-arm64"
UNIVERSAL_BIN="$MACOS_DIR/${APP_NAME}"

# -swift-version 5：钉死 Swift 5 语言模式，防止未来默认切到 Swift 6 语言模式后
# 引入 @MainActor 隐式并发（Big Sur 缺 _Concurrency 回退库，启动即崩）。
echo "==> 编译 x86_64 slice（交付目标：Intel 2014 MacBook Air / Big Sur 11）"
# shell/DailyQuota.swift（WTJ-20260707-004）：跨日重置纯逻辑，除 main.swift 外唯一的
# 额外源文件，本身只含函数声明、无顶层语句（Swift 多文件编译规则：顶层可执行语句只能出现
# 在名为 main.swift 的文件里），一并传给 swiftc 即视为同一模块，main.swift 无需 import。
swiftc -O -swift-version 5 -target "x86_64-apple-macosx${MIN_OS}" -sdk "$SDK" \
  -o "$X64_BIN" shell/main.swift shell/DailyQuota.swift

echo "==> 编译 arm64 slice（本机 Apple Silicon 原生冒烟用）"
swiftc -O -swift-version 5 -target "arm64-apple-macosx${MIN_OS}" -sdk "$SDK" \
  -o "$ARM64_BIN" shell/main.swift shell/DailyQuota.swift

echo "==> lipo 合成 universal 二进制"
lipo -create -output "$UNIVERSAL_BIN" "$X64_BIN" "$ARM64_BIN"
chmod +x "$UNIVERSAL_BIN"

echo "==> 拷贝 web 资源到 Resources/web/"
mkdir -p "$RESOURCES_DIR/web"
cp -R "$SCRIPT_DIR/web/"* "$RESOURCES_DIR/web/"

# WTJ-20260708-002：接入 macOS app icon。app/AppIcon.icns 由 DESIGN 已验收源图
# docs/assets/app-icon/worktime-justin-icon-1024.png（WTJ-20260708-001 第七版，
# DESIGN commit 5a86f61）经 sips + iconutil 生成（10 尺寸 iconset，16~512@1x/@2x）。
# 复制到 Resources/ 并由下方 Info.plist 的 CFBundleIconFile 引用，Dock/Finder/
# Application surfaces 即显示新图标。图标改版时按 docs/assets/app-icon/worktime-justin-icon-source.md
# 「TL 集成」节的 sips + iconutil 命令从 1024 源图重生成 app/AppIcon.icns。
echo "==> 拷贝 app icon 到 Resources/AppIcon.icns"
if [ ! -f "$SCRIPT_DIR/AppIcon.icns" ]; then
  echo "错误：缺少 app/AppIcon.icns（app 图标资源）" >&2
  exit 1
fi
cp "$SCRIPT_DIR/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"

echo "==> 写入 Info.plist"
cat > "$CONTENTS_DIR/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>WTJBuildCommit</key>
    <string>${GIT_COMMIT}</string>
    <key>LSMinimumSystemVersion</key>
    <string>${MIN_OS}</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "==> 写入 PkgInfo"
printf 'APPL????' > "$CONTENTS_DIR/PkgInfo"

echo "==> ad-hoc 签名"
codesign --force --deep -s - "$APP_BUNDLE"

echo "==> 生成 dmg"
rm -f "$DMG_PATH"
hdiutil create -volname "$APP_NAME" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_PATH"

# ---------------------------------------------------------------------------
# 构建后自动验证：任何一步失败即退出非零
# ---------------------------------------------------------------------------

echo ""
echo "======================= 构建后验证 ======================="

echo ""
echo "--- lipo -archs（universal 可执行文件）---"
LIPO_ARCHS=$(lipo -archs "$UNIVERSAL_BIN")
echo "$LIPO_ARCHS"
echo "$LIPO_ARCHS" | grep -q "x86_64" || { echo "错误：universal 二进制缺少 x86_64 slice" >&2; exit 1; }
echo "$LIPO_ARCHS" | grep -q "arm64" || { echo "错误：universal 二进制缺少 arm64 slice" >&2; exit 1; }

echo ""
echo "--- LC_BUILD_VERSION（otool -l，两个 slice 均应为 platform=macos(1) / minos=${MIN_OS}）---"
for SLICE_BIN in "$X64_BIN" "$ARM64_BIN"; do
  SLICE_NAME=$(basename "$SLICE_BIN")
  BUILD_VERSION=$(otool -l "$SLICE_BIN" | grep -A4 LC_BUILD_VERSION || true)
  if [ -z "$BUILD_VERSION" ]; then
    echo "错误：$SLICE_NAME 未找到 LC_BUILD_VERSION" >&2
    exit 1
  fi
  echo "[$SLICE_NAME]"
  echo "$BUILD_VERSION"
  echo "$BUILD_VERSION" | grep -q "platform 1" || { echo "错误：$SLICE_NAME platform 不是 macos(1)" >&2; exit 1; }
  echo "$BUILD_VERSION" | grep -q "minos ${MIN_OS}" || { echo "错误：$SLICE_NAME minos 不是 ${MIN_OS}" >&2; exit 1; }
done

echo ""
echo "--- 并发硬门禁（两个 slice：禁止链接并发运行时库 / 禁止并发符号引用）---"
for SLICE_BIN in "$X64_BIN" "$ARM64_BIN"; do
  SLICE_NAME=$(basename "$SLICE_BIN")
  if otool -L "$SLICE_BIN" | grep -q libswift_Concurrency; then
    echo "错误：$SLICE_NAME 链接了并发运行时库 libswift_Concurrency" >&2
    exit 1
  fi
  if nm -u "$SLICE_BIN" | grep -qiE 'swift_task|MainActor'; then
    echo "错误：$SLICE_NAME 存在并发符号引用（swift_task/MainActor）" >&2
    nm -u "$SLICE_BIN" | grep -iE 'swift_task|MainActor' >&2
    exit 1
  fi
  echo "[$SLICE_NAME] 未链接 libswift_Concurrency，无 swift_task/MainActor 符号引用"
done

echo ""
echo "--- Info.plist WTJBuildCommit（诊断日志/web 层 __WTJ_BUILD_INFO 用，见 WTJ-20260705-017）---"
PLIST_COMMIT=$(/usr/libexec/PlistBuddy -c "Print :WTJBuildCommit" "$CONTENTS_DIR/Info.plist" 2>/dev/null || true)
if [ -z "$PLIST_COMMIT" ]; then
  echo "错误：Info.plist 缺少 WTJBuildCommit 键" >&2
  exit 1
fi
echo "WTJBuildCommit=$PLIST_COMMIT"
[ "$PLIST_COMMIT" = "$GIT_COMMIT" ] || { echo "错误：Info.plist 里的 WTJBuildCommit 与构建期采集值不一致" >&2; exit 1; }

echo ""
echo "--- app icon（WTJ-20260708-002：CFBundleIconFile + Resources/AppIcon.icns 均须就位）---"
PLIST_ICON=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$CONTENTS_DIR/Info.plist" 2>/dev/null || true)
[ "$PLIST_ICON" = "AppIcon" ] || { echo "错误：Info.plist 的 CFBundleIconFile 应为 AppIcon（实测 '$PLIST_ICON'）" >&2; exit 1; }
[ -f "$RESOURCES_DIR/AppIcon.icns" ] || { echo "错误：bundle 缺少 Resources/AppIcon.icns" >&2; exit 1; }
ICON_TYPE=$(file "$RESOURCES_DIR/AppIcon.icns" | grep -c "Mac OS X icon") || true
[ "$ICON_TYPE" = "1" ] || { echo "错误：Resources/AppIcon.icns 不是有效的 Mac OS X icon 文件" >&2; exit 1; }
echo "CFBundleIconFile=$PLIST_ICON, Resources/AppIcon.icns=$(du -h "$RESOURCES_DIR/AppIcon.icns" | cut -f1) 有效"

echo ""
echo "--- codesign -v ---"
if codesign -v "$APP_BUNDLE" 2>&1; then
  echo "codesign 验证通过"
else
  echo "错误：codesign 验证失败" >&2
  exit 1
fi

echo ""
echo "--- bundle 内文件清单 ---"
find "$APP_BUNDLE" -type f | sed "s#${DIST_DIR}/##" | sort

echo ""
echo "--- dmg 大小 ---"
ls -lh "$DMG_PATH"
du -h "$DMG_PATH"

echo ""
echo "======================= 验证完成 ======================="
echo ""
echo "构建产物: $APP_BUNDLE"
echo "构建产物: $DMG_PATH"

if [ "$RUN_AFTER_BUILD" -eq 1 ]; then
  echo ""
  echo "==> --run：以窗口化调试模式启动（WTJ_WINDOWED=1，普通可关闭窗口，不锁屏）"
  WTJ_WINDOWED=1 open "$APP_BUNDLE"
fi
