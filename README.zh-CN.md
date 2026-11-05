# Canvas Sync（中文说明）

[English](README.md) · 当前界面为英文，以下操作使用对应的英文按钮名称。

将选中的 Canvas 课程同步到本地，便于你查看原始资料，也便于 Codex 等工具读取。此版本只处理课程页面、文件、作业、公告和模块结构；可尝试获取 Canvas 页面中直接提供的 Zoom 录播转录或音频；暂不支持内嵌录播。

## Windows 使用

1. 如果尚未安装 Node.js LTS，在 Windows 开始菜单搜索并打开 **PowerShell**，粘贴下面的命令并按回车：

   ```powershell
   winget install --id OpenJS.NodeJS.LTS --exact --source winget
   ```

   按提示完成安装；如果 Windows 询问是否允许安装，请选择“是”。安装完成后关闭 PowerShell，再执行下一步。若提示找不到 `winget`，可从 [Node.js 官网](https://nodejs.org/)下载 LTS 安装包，并保留默认的 npm 选项。
2. 解压本压缩包，双击 `start-windows.bat`。首次启动会安装程序依赖及 Chromium，需要联网。
3. 界面打开后，在「Canvas address」输入学校的 Canvas 地址并点击「Save address」。默认填入 UTS，其他学校请更改。点击「Sign in to Canvas」，在新浏览器中完成 Canvas 登录和验证，然后返回界面点击「Refresh courses」。Dashboard 课程显示在前，其他可访问课程显示在后。
4. 在「Sync folder」查看默认路径，或点击「Choose folder」更改；也可以输入一个已有文件夹的完整路径，再点击「Save folder」。位置会在下次启动时保留。更改位置不会移动已经同步的文件。
5. 勾选一门或多门课程，点击右上角的「Sync selected courses」。每门课有单独的进度条，程序依次同步选中的课程。同步结束如果有未完成项，原因会显示在进度条下方。
6. 打开同步位置中的课程文件夹，在 `Course Index.md` 查看模块和资料链接。

程序运行期间请保持黑色命令窗口开启。登录由用户在浏览器完成，登录会话保存在当前 Windows 用户目录的 `.canvas-course-library/browser`，程序不会向其他服务上传课程文件。

## Ubuntu 使用

1. 从 [Node.js 官网](https://nodejs.org/en/download)安装 Node.js LTS（包含 npm），重新打开终端后运行 `node --version` 和 `npm --version` 确认安装成功。
2. 在解压后的项目目录中打开终端，安装文件夹选择器和 Playwright 系统依赖：

   ```bash
   sudo apt update
   sudo apt install -y zenity xdg-utils
   npm install
   npx playwright install-deps chromium
   ```

3. 在项目目录启动：

   ```bash
   bash start-ubuntu.sh
   ```

   首次启动会下载 Chromium。界面会在默认浏览器中打开；如果没有自动打开，请访问 `http://127.0.0.1:38465`。使用时保持终端开启，登录、选课和同步步骤与 Windows 相同。默认同步位置是 `~/Documents/Canvas Course Library`，浏览器登录会话保存在 `~/.canvas-course-library/browser`。

登录浏览器和文件夹选择器需要 Ubuntu 图形桌面。也可以直接输入已有文件夹的完整路径。Ubuntu 尚未使用真实 Canvas 账号完成端到端测试。

## 本地组织

- 使用其他学校的 Canvas 地址时，课程会存放在同步位置下对应学校的子文件夹；已有 UTS 课程路径不变。
- `Modules`：按 Canvas 模块建立目录，保存页面、附件及作业。页面中识别出的 Canvas 附件链接指向本地文件。
- `Other Materials`：不在任何模块中发现的资料、未归入模块的作业及课程公告。
- `Other Materials/Recordings`：直接提供的 Zoom 链接、识别到的密码及可获取的字幕或音频。
- `Course Index.md`：按模块顺序列出资料；同一份文件可以被多个模块引用，但只保存一份原文件。
- `.canvas-sync.json`：记录文件路径和上次同步信息。

重新同步时，远端未变的文件不会重复下载；已被你编辑的文件不会静默覆盖。Canvas 上已经删除的资料不会被自动删除。若某些内容无法访问，程序会显示“部分内容未同步”，并在课程索引中列出失败原因。

## 当前限制

- 默认地址为 UTS Canvas；其他学校请在登录前修改。尚未使用其他学校的账号完成端到端测试。
- 尚未在 Windows 或通过本程序登录后的真实 UTS Canvas 课程上完成端到端测试。云端浏览器已验证 UTS 登录会话可以读取 Canvas 课程接口；课程同步本身已使用模拟课程数据测试。
- 程序会尝试获取 Canvas 页面或模块外链中的 Zoom 录播所提供的 VTT/SRT 字幕、独立转录页面上的下载文件，或 M4A/MP3 音频。能否访问取决于分享设置；Zoom 流程尚未完成真实录播端到端测试。暂不支持内嵌 Zoom 或其他录播平台，也不下载视频。
- 只能同步当前账号有权访问、且能够通过 Canvas 接口发现的内容。第三方平台、受限文件及复杂嵌入内容可能无法离线保存；请查看失败提示和课程索引。
- 课程列表包含 Canvas 返回的当前、已完成和待加入课程；如果学校限制历史课程访问，部分课程或资料可能无法读取。
- 页面中的 Canvas 文件链接会尽量指向本地附件。页面之间的链接和其他外部链接仍可能需要网络及 Canvas 登录。
- 生成的课程索引若被手动修改，后续同步会保留该文件并提示冲突；建议在单独文件中记笔记。
