# Desktop Pet Player 0.5.0

一个面向 Windows 的通用透明桌面宠物播放器。播放器不绑定某只宠物；宠物名称、性格、动画、行为和资源路径全部来自可移植的 `.petpack` 包。

## 功能

- 透明无边框窗口，可见像素附近接收点击，透明区域鼠标穿透
- 待机、行走、坐下、睡觉和互动动画
- 拖动、自动漫游、左右朝向、托盘、右键菜单和开机启动
- 导入、校验和切换 `.petpack`
- 把一个宠物包封装成客户专属 Windows 便携版 EXE
- 动画安全边距、串帧、断尾、体量、重心和基线自动检查

## 直接使用

从 GitHub Releases 下载 `Desktop-Pet-Player-0.5.0.exe` 后双击运行。首次启动会安装仓库内置的示例宠物包。

当前公开构建未进行 Windows 代码签名，Windows SmartScreen 可能显示未知发布者。请核对 Release 同时提供的 `build-report.json` 中的 SHA-256。

## 开发环境

- Windows 10 或更高版本
- Node.js 24；最低支持 22.12
- Python 3.11 或更高版本

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
npm start
```

也可以手动执行 `python -m pip install --requirement requirements-dev.txt`、`npm ci` 和 `npm test`。

构建通用便携版：

```powershell
npm run build
```

输出位于 `dist/Desktop-Pet-Player-0.5.0.exe`。

## `.petpack` 格式

`.petpack` 是使用专用扩展名的 ZIP 文件，包根目录包含：

```text
pet.json
preview.png
animations/
  idle/       # 4 frames
  walk/       # 6 frames
  sit/        # 4 frames
  sleep/      # 4 frames
  reaction/   # 4 frames
```

验证资源包：

```powershell
python skills/desktop-pet-maker/scripts/petpack_tool.py validate pets/packages/xiaogou.petpack
```

播放器把资源包视为不受信任输入，会在解压前检查路径穿越、反斜杠路径、重复及大小写冲突、文件数量、解压体积、额外未引用文件、清单字段和 PNG 格式。

格式细节见 `skills/desktop-pet-maker/references/petpack-schema.md`。

## 在 Codex 中制作新宠物

朋友 clone 仓库并用 Codex 打开后，只需先附上照片并发送：

```text
我想制作属于自己的桌面宠物。请用选择题引导我完成。
```

Codex 会自动读取项目根目录的 `AGENTS.md` 和 `.agents/skills/desktop-pet-maker`，先说明照片要求，再分三轮收集对象/风格、动作功能、气泡/语音与交付设置。选项支持多选编号，例如 `B1,B3,F1,F4,D1`。

所有可选功能默认不选，气泡与系统语音默认关闭。播放器不会再自动插入“黏人”类台词；只有资源包中明确配置的文字才会出现。

完整选择目录见 `skills/desktop-pet-maker/references/intake-workflow.md`，机器可读功能模块可用 `npm run make:human -- --list-features` 查看。

项目内的 `.agents/skills/desktop-pet-maker` 是 Codex 自动发现入口，实际流程与脚本位于 `skills/desktop-pet-maker`。朋友 clone 仓库后，在 Codex 中打开仓库、附上同一只宠物的 1～8 张照片，然后可直接发送：

```text
请根据我附上的宠物照片，使用 desktop-pet-maker 制作完整的 Windows 桌面宠物。

宠物名字：旺财
性格：活泼、粘人
程序名称：旺财桌面宠物
风格：柔和 2D 插画风
重点特征：保留额头白斑、棕色耳朵和卷尾

请生成并验证 .petpack，再构建客户专属便携版 EXE，实际启动检查后交付 EXE、build-report.json 和验证结果。
```

Codex 会按以下标准流程工作：

```text
原始照片 → 动作条生成 → 去除背景 → 统一画布/体量/重心/基线
        → 安全门禁 → pet.json → petpack 验证与打包 → 客户专属 EXE
```

原始照片和制作工作目录默认被 Git 忽略。请勿把客户照片、客户包或运行截图提交到公共仓库。

## 真人桌宠功能框架

真人桌宠使用构建期功能模块，不需要为每个人修改播放器代码。基础素材只要求处理好的 `idle` 4 帧和 `walk` 6 帧；选择“称呼”时增加 `reaction` 4 帧，选择“磕头”时增加 `sit` 4 帧。`sleep` 和未选择功能对应的 schema-v1 必需动作会自动复制 `idle` 帧作为兼容资源，并且不会加入随机行为。

先按功能生成素材计划：

```powershell
npm run make:human -- --id lai-rongjie --name "赖荣杰" --features call-relative,kowtow --call-label "叫哥哥" --call-message "赖荣杰哥哥" --call-speech "赖荣杰哥哥" --plan-only
```

计划会给出 `processingCommand`；动画处理器通过 `--actions` 只读取所选动作，不需要为未选功能制作或伪造动画条。

素材处理完成后，一键组装并验证 `.petpack`：

```powershell
npm run make:human -- --id lai-rongjie --name "赖荣杰" --frames-dir pets/work/lai-rongjie/frames --preview pets/work/lai-rongjie/preview.png --features call-relative,kowtow --call-label "叫哥哥" --call-message "赖荣杰哥哥" --call-speech "赖荣杰哥哥"
```

也可以复制 `pet-framework/examples/human-pet.example.json`，修改人物、素材路径和功能后运行：

```powershell
npm run make:human -- --config pet-framework/examples/human-pet.example.json --force
```

功能定义位于 `pet-framework/features/`。当前包含喝水、吃零食、伸懒腰、挥手、跳舞、屏幕边缘坐姿、通用称呼、磕头和粉丝问候；每个可见功能都有独立动作，气泡和系统语音默认关闭且可按功能配置。添加 `--build-exe --app-name "赖荣杰桌面宠物"` 可在资源包验证通过后继续调用客户 EXE 构建器。

## 客户专属 EXE

```powershell
npm run build:customer -- --pet pets/packages/xiaogou.petpack --name "小狗桌面宠物" --delivery-id xiaogou
```

输出位于 `dist/customers/<delivery-id>/`，包含便携版 EXE 和 `build-report.json`。客户版默认只包含指定宠物，并隐藏导入、切换和宠物库入口；传入 `--allow-management` 可保留管理功能。

## 安全与贡献

- 漏洞报告：参见 `SECURITY.md`
- 贡献流程：参见 `CONTRIBUTING.md`
- 版本变化：参见 `CHANGELOG.md`
- 源代码采用 [MIT License](LICENSE)
- `xiaogou.petpack`、程序图标和托盘图采用 [CC BY 4.0](ASSETS_LICENSE.md)，署名 redniu123

请只提交你有权再分发的图片和宠物包。
