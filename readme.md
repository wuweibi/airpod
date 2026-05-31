![banner.jpg](image%2Fbanner.jpg)
# AirPod Teardown Study

一个用于展示 AirPod 拆解过程的前端演示页。当前版本已经移除 3D 拆解，只保留视频演示：用户通过鼠标滚轮控制拆解视频进度，正向滚动播放正序视频，反向滚动播放倒序视频，从而避免浏览器直接倒放或频繁 seek 造成卡顿。

## 当前功能

- 全屏 AirPod 拆解视频背景
- 鼠标滚轮控制视频拆解进度
- 快速前进时视频会加速追赶目标进度
- 反向滚动时切换到倒序视频正向播放，提升倒放流畅度
- 右侧竖向进度条，样式接近滚动条
- 手机端适配：顶部信息压缩、标题下置、进度条贴右侧
- 支持部署到 `/airpod/` 子目录

## 技术栈

- Vite
- React
- Framer Motion
- Lucide React
- `@ffmpeg-installer/ffmpeg` 用于本地生成倒序视频和 poster

## 目录说明

```text
src/
  App.jsx        页面逻辑、滚轮控制、正反向视频切换
  styles.css     页面视觉、响应式和竖向进度条样式
public/
  teardown-airpod.mp4           当前正向演示视频
  teardown-airpod-reverse.mp4   当前倒序演示视频
  teardown-poster.jpg           首帧兜底图，避免视频首帧黑屏
vite.config.js                  Vite 配置，base 为 /airpod/
```

## 开发运行

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:5173/
```

## 构建

```bash
npm run build
```

构建产物在：

```text
dist/
```

当前项目配置了：

```js
base: "/airpod/"
```

因此生产环境应把 `dist` 目录内容部署到服务器的 `/airpod/` 路径下。构建后的资源路径会类似：

```text
/airpod/assets/...
/airpod/teardown-airpod.mp4
/airpod/teardown-airpod-reverse.mp4
/airpod/teardown-poster.jpg
```

## 替换视频

当前使用的是根目录里的：

```text
arpod-4k.mp4
```

替换流程：

1. 把新视频复制到 `public/teardown-airpod.mp4`
2. 重新生成倒序视频 `public/teardown-airpod-reverse.mp4`
3. 重新生成首帧图 `public/teardown-poster.jpg`
4. 运行构建检查

PowerShell 示例：

```powershell
Copy-Item -LiteralPath '.\你的新视频.mp4' -Destination '.\public\teardown-airpod.mp4' -Force

$ffmpeg = node -e "console.log(require('@ffmpeg-installer/ffmpeg').path)"
& $ffmpeg -y -i public/teardown-airpod.mp4 -vf reverse -an -movflags +faststart public/teardown-airpod-reverse.mp4
& $ffmpeg -y -ss 0.2 -i public/teardown-airpod.mp4 -frames:v 1 -q:v 2 public/teardown-poster.jpg

npm run build
```

## 为什么需要倒序视频

浏览器的 `<video>` 不支持稳定的负速播放。之前尝试过通过频繁修改 `currentTime` 模拟倒放，但会导致明显卡顿，尤其是高分辨率视频。当前方案是提前生成倒序视频，反向滚动时播放倒序视频的正向时间轴，这样解码路径更稳定。

## 交互逻辑

- 滚轮不是直接跳到目标帧，而是设置目标进度
- 页面根据目标进度计算当前视频应该追赶的时间点
- 正向时播放正序视频
- 反向时播放倒序视频
- 距离目标越远，播放速率越高，最高约 `2.25x`
- 接近目标时自动暂停并缓动贴近

## 已移除内容

项目早期做过概念 3D 拆解、零件清单和步骤模块。由于效果不符合预期，后续已移除，目前项目只保留视频演示。

## 注意事项

- 如果更换 4K 或更长视频，倒序视频生成时间会增加
- 倒序视频建议保留 `-movflags +faststart`，便于浏览器更快加载
- 如果视频首屏黑屏，重新生成 `teardown-poster.jpg`
- 如果部署路径不是 `/airpod/`，需要同步修改 `vite.config.js` 里的 `base`
