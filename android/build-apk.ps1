param(
    [string]$Jdk = $env:JAVA_HOME,
    [string]$AndroidJar = '',
    [string]$BuildTools = ''
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not $Jdk) { $Jdk = 'C:\Program Files\Java\jdk-21' }
if (-not $AndroidJar) { $AndroidJar = Join-Path $taskRoot '.tools\platform\android-36\android.jar' }
if (-not $BuildTools) { $BuildTools = Join-Path $taskRoot '.tools\build-tools\android-16' }
foreach ($taskRequired in @("$Jdk\bin\javac.exe", $AndroidJar, "$BuildTools\aapt2.exe")) {
    if (-not (Test-Path -LiteralPath $taskRequired)) { throw "缺少构建工具: $taskRequired。请参阅 android/README.md。" }
}
function Invoke-BuildStep([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "构建失败: $Executable (exit $LASTEXITCODE)" }
}
$taskBuild = Join-Path $PSScriptRoot 'app\build\manual'
$taskDist = Join-Path $taskRoot 'dist'
$taskSigning = Join-Path $PSScriptRoot '.signing'
# Only generated output in this project's build directory is cleared.
if (Test-Path -LiteralPath $taskBuild) {
    $taskResolved = (Resolve-Path -LiteralPath $taskBuild).Path
    $taskAllowed = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app\build')) + '\'
    if (-not $taskResolved.StartsWith($taskAllowed,[StringComparison]::OrdinalIgnoreCase)) { throw '构建输出路径无效' }
    Remove-Item -LiteralPath $taskResolved -Recurse -Force
}
foreach ($taskDirectory in @($taskBuild,"$taskBuild\classes","$taskBuild\generated","$taskBuild\dex","$taskBuild\assets",$taskDist,$taskSigning)) {
    New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
}
foreach ($taskAsset in @('index.html','app.js','amount-calculator.js','styles.css')) { Copy-Item -LiteralPath (Join-Path $taskRoot "web\$taskAsset") -Destination "$taskBuild\assets\$taskAsset" }
$taskManifest = Get-Content -LiteralPath "$PSScriptRoot\app\src\main\AndroidManifest.xml" -Raw
$taskManifest = $taskManifest.Replace('<manifest ', '<manifest package="cn.personal.money" ')
[IO.File]::WriteAllText("$taskBuild\AndroidManifest.xml",$taskManifest,[Text.UTF8Encoding]::new($false))
Invoke-BuildStep "$BuildTools\aapt2.exe" @('compile','--dir',"$PSScriptRoot\app\src\main\res",'-o',"$taskBuild\resources.zip")
Invoke-BuildStep "$BuildTools\aapt2.exe" @('link','-I',$AndroidJar,'--manifest',"$taskBuild\AndroidManifest.xml",'-o',"$taskBuild\unsigned.apk",'--java',"$taskBuild\generated",'-A',"$taskBuild\assets",'--auto-add-overlay',"$taskBuild\resources.zip")
$taskSources = @(Get-ChildItem -LiteralPath "$PSScriptRoot\app\src\main\java","$taskBuild\generated" -Filter '*.java' -Recurse | ForEach-Object { $_.FullName })
Invoke-BuildStep "$Jdk\bin\javac.exe" (@('-J-Dfile.encoding=UTF-8','-encoding','UTF-8','-source','8','-target','8','-Xlint:-options','-bootclasspath',"$AndroidJar;$BuildTools\core-lambda-stubs.jar",'-d',"$taskBuild\classes") + $taskSources)
Invoke-BuildStep "$Jdk\bin\jar.exe" @('--create','--file',"$taskBuild\classes.jar",'-C',"$taskBuild\classes",'.')
Invoke-BuildStep "$Jdk\bin\java.exe" @('-cp',"$BuildTools\lib\d8.jar",'com.android.tools.r8.D8','--lib',$AndroidJar,'--min-api','26','--output',"$taskBuild\dex", "$taskBuild\classes.jar")
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [IO.Compression.ZipFile]::Open("$taskBuild\unsigned.apk",[IO.Compression.ZipArchiveMode]::Update)
try {
    foreach ($taskDex in (Get-ChildItem -LiteralPath "$taskBuild\dex" -Filter '*.dex')) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$taskDex.FullName,$taskDex.Name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $taskZip.Dispose() }
Invoke-BuildStep "$BuildTools\zipalign.exe" @('-f','4',"$taskBuild\unsigned.apk","$taskBuild\aligned.apk")
$taskKey = Join-Path $taskSigning 'personal-release.p12'
$taskPassword = Join-Path $taskSigning 'password.txt'
if (-not (Test-Path -LiteralPath $taskKey)) {
    $taskRandom = New-Object byte[] 32
    $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskRng.GetBytes($taskRandom) } finally { $taskRng.Dispose() }
    [IO.File]::WriteAllText($taskPassword,[Convert]::ToBase64String($taskRandom),[Text.UTF8Encoding]::new($false))
    Invoke-BuildStep "$Jdk\bin\keytool.exe" @('-genkeypair','-keystore',$taskKey,'-storetype','PKCS12','-storepass:file',$taskPassword,'-keypass:file',$taskPassword,'-alias','money-manager','-keyalg','RSA','-keysize','3072','-validity','36500','-dname','CN=Money Manager Personal, OU=Personal, O=Local, C=CN')
}
if (-not (Test-Path -LiteralPath $taskPassword)) { throw '签名密码文件缺失，请恢复原签名备份，不要重新生成密钥。' }
$taskApk = Join-Path $taskDist 'money-manager-0.2.0.apk'
Invoke-BuildStep "$Jdk\bin\java.exe" @('-jar',"$BuildTools\lib\apksigner.jar",'sign','--ks',$taskKey,'--ks-key-alias','money-manager','--ks-pass',"file:$taskPassword",'--out',$taskApk,"$taskBuild\aligned.apk")
Write-Output "已生成: $taskApk"
Write-Output '请保留 android/.signing 中的签名材料，用于以后覆盖升级。'
