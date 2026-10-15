# Android 工程

## 实现

首个可安装版本采用 **本地 WebView 界面 + Java 原生系统能力**。界面与网页版共用 `../web`，不加载远程网页，也不依赖服务器。日后可以逐页替换 UI，并保留 JSON 备份格式。

- 包名 `cn.personal.money`；版本 `0.2.0` / `versionCode 2`。
- `minSdk 26`、`targetSdk 36`、`compileSdk 36`。
- `MainActivity`：受限的本地资源页面、SQLite 数据桥接、通知授权、SAF 文件选择、报告通知跳转、系统返回。
- `LedgerStore`：私有 SQLite `kv` 表，存放账单 JSON、设置 JSON、报告缓存、通知去重键。账单和设置在一个事务内保存；快捷记账使用同一存储。
- `ReportEngine`：本地日期判断、报告聚合、严格大于 50 元的奢侈消费及校园卡例外。
- `ReportScheduler` / `ReportReceiver`：21:00 的非精确 AlarmManager 调度、通知渠道、补齐报告、重启/时区变更重排。
- `QuickEntryActivity`：原生独立记账表单，通过静态或固定桌面快捷方式启动。

应用没有 INTERNET、外部存储、精确闹钟、短信或无障碍权限。文件读写使用用户主动选择的系统文档 URI。WebView 只允许内置 HTML、JS、CSS，禁用普通文件访问和外部导航。

## 从源码构建

需要 JDK 21、Android SDK Platform 36 和 Android Build Tools 36。安装并配置这些工具后，在 `android/` 目录运行：

```powershell
.\build-apk.ps1 -Jdk 'C:\path\to\jdk' -AndroidJar 'C:\path\to\sdk\platforms\android-36\android.jar' -BuildTools 'C:\path\to\sdk\build-tools\36.0.0'
```

输出：`../dist/money-manager-0.2.0.apk`。

脚本使用 AAPT2、javac、D8、zipalign、apksigner 编译、打包与签名，不依赖 Gradle 下载。输出目录在 `app/build/manual`，每次构建仅清理这个目录。首次构建会在本机创建 `.signing`；后续本机构建复用这份密钥。该目录已被 Git 忽略。

如果工具已经放在项目的默认 `.tools/` 目录，直接运行 `.\build-apk.ps1` 即可。项目不会提交 Android SDK、JDK 或本机工具缓存。

## Android Studio

也提供标准 Gradle 工程：用 Android Studio 打开本目录，配置 SDK 后同步。Gradle 构建与本机脚本使用相同 Java 源码、资源和网页；普通 `assembleDebug` 使用 Android 的调试签名，不能直接覆盖 GitHub Release 中的安装版。

本次只运行了直接构建脚本；Android Studio / Gradle 路径尚未执行。

## 维护约定

1. 修改界面时编辑 `../web`，再构建 APK。网页预览保留示例数据，Android 端首次启动为空账本。
2. 金额用整数分；原始账单为计算依据，总结可重算。首次导入采用全量替换，不提供合并模式。
3. JSON 备份继续使用 `app: money-manager-web`、`version: 2`，兼容此前网页版；CSV 表头固定为 `date,type,amount,category,note`。
4. 更新版本时同步 `app/build.gradle`、`AndroidManifest.xml` 和构建脚本的输出文件名。
5. `../dist`、`../.tools`、`app/build`、`.signing` 已忽略，不提交二进制缓存和签名材料。

## 调度依据

Android 13 及以上需获得通知权限后才能发送普通通知：[官方通知权限文档](https://developer.android.com/develop/ui/views/notifications/notification-permission)。

后台使用非精确 AlarmManager，系统可以延迟执行；无需精确闹钟权限：[官方后台调度文档](https://developer.android.com/develop/background-work/services/alarms/schedule)。

发行版已完成编译和签名，并有基础界面与记账功能的实际使用反馈。尚未完成自动化测试或跨设备后台提醒验证。
