# Android 工程

## 实现

首个可安装版本采用 **本地 WebView 界面 + Java 原生系统能力**。界面复用已确认的 `../web`，不加载远程网页，也不依赖服务器。相较原方案中的 Kotlin / Compose / Room，这是首版的实现调整；日后需要时可逐页替换 UI，保留 JSON 备份格式。

- 包名 `cn.personal.money`；版本 `0.1.0` / `versionCode 1`。
- `minSdk 26`、`targetSdk 36`、`compileSdk 36`。
- `MainActivity`：受限的本地资源页面、SQLite 数据桥接、通知授权、SAF 文件选择、报告通知跳转、系统返回。
- `LedgerStore`：私有 SQLite `kv` 表，存放账单 JSON、设置 JSON、报告缓存、通知去重键。账单和设置在一个事务内保存；快捷记账使用同一存储。
- `ReportEngine`：本地日期判断、报告聚合、严格大于 50 元的奢侈消费及校园卡例外。
- `ReportScheduler` / `ReportReceiver`：21:00 的非精确 AlarmManager 调度、通知渠道、补齐报告、重启/时区变更重排。
- `QuickEntryActivity`：原生独立记账表单，通过静态或固定桌面快捷方式启动。

应用没有 INTERNET、外部存储、精确闹钟、短信或无障碍权限。文件读写使用用户主动选择的系统文档 URI。WebView 只允许内置 HTML、JS、CSS，禁用普通文件访问和外部导航。

## 在这台电脑构建

本机已经准备 JDK 21、官方 Android 36 平台及 Build Tools 36。直接运行：

```powershell
& 'G:\Desktop\money manager\android\build-apk.ps1'
```

输出：`../dist/money-manager-0.1.0.apk`。

脚本使用 AAPT2、javac、D8、zipalign、apksigner 编译、打包与签名，不依赖 Gradle 下载。输出目录在 `app/build/manual`，每次构建仅清理这个目录。签名目录 `.signing` 会保留，后续构建复用原密钥。

其他电脑安装官方 Android SDK 后，可以传入工具位置：

```powershell
.\build-apk.ps1 -Jdk 'C:\path\to\jdk' -AndroidJar 'C:\path\to\sdk\platforms\android-36\android.jar' -BuildTools 'C:\path\to\sdk\build-tools\36.0.0'
```

当前本机工具缓存是 `../.tools/platform/android-36` 和 `../.tools/build-tools/android-16`；后者文件夹名称来自 Google 的 Build Tools 36 压缩包。

## Android Studio

也提供标准 Gradle 工程：用 Android Studio 打开本目录，配置 SDK 后同步。Gradle 构建与本机脚本使用相同 Java 源码、资源和网页；普通 `assembleDebug` 使用 Android 的调试签名，与本次个人签名不同，不能直接覆盖本次 APK。后续要覆盖升级，优先继续用 `build-apk.ps1`。

本次只运行了直接构建脚本；Android Studio / Gradle 路径尚未执行。

## 维护约定

1. 修改界面时编辑 `../web`，再构建 APK。网页预览保留示例数据，Android 端首次启动为空账本。
2. 金额用整数分；原始账单为计算依据，总结可重算。首次导入采用全量替换，不提供合并模式。
3. JSON 备份继续使用 `app: money-manager-web`、`version: 2`，兼容此前网页版；CSV 表头固定为 `date,type,amount,category,note`。
4. 更新版本时同步 `app/build.gradle`、`AndroidManifest.xml` 和构建脚本的输出文件名。
5. `../dist`、`../.tools`、`app/build`、`.signing` 已忽略，不提交二进制缓存和个人签名材料。

## 调度依据

Android 13 及以上需获得通知权限后才能发送普通通知：[官方通知权限文档](https://developer.android.com/develop/ui/views/notifications/notification-permission)。

后台使用非精确 AlarmManager，系统可以延迟执行；无需精确闹钟权限：[官方后台调度文档](https://developer.android.com/develop/background-work/services/alarms/schedule)。

本次已编译并签名，未运行自动化测试；用户已实际体验基础界面与功能，后台提醒仍需在目标 vivo 手机上确认。
