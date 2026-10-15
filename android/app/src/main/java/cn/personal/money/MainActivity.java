package cn.personal.money;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String ORIGIN="https://money-manager.local/";
    private static final int EXPORT=10, IMPORT=11, NOTIFICATIONS=12;
    private WebView web;
    private boolean ready;
    private String importType="json", pendingImport;
    private final String exportCache="pending-export.txt";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ReportScheduler.channel(this);
        LedgerStore.get(this);
        if (state!=null) importType=state.getString("importType","json");
        FrameLayout root=new FrameLayout(this); root.setBackgroundColor(Color.rgb(248,247,244));
        web=new WebView(this); web.setBackgroundColor(Color.rgb(248,247,244));
        root.addView(web,new FrameLayout.LayoutParams(-1,-1)); setContentView(root);
        if (Build.VERSION.SDK_INT>=30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view,insets) -> {
                android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
                view.setPadding(safe.left,safe.top,safe.right,safe.bottom); return insets;
            });
            getWindow().getInsetsController().setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(),"AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !request.getUrl().toString().equals(ORIGIN+"index.html"); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                String url=request.getUrl().toString();
                String name=url.startsWith(ORIGIN)?url.substring(ORIGIN.length()):"";
                if (!name.equals("index.html") && !name.equals("app.js") && !name.equals("amount-calculator.js") && !name.equals("styles.css")) return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                try { return new WebResourceResponse(name.endsWith("html")?"text/html":name.endsWith("css")?"text/css":"application/javascript","UTF-8",getAssets().open(name)); }
                catch (IOException error) { return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("加载失败".getBytes(StandardCharsets.UTF_8))); }
            }
            @Override public void onPageFinished(WebView view,String url) {
                ready=true; deliverIntent();
                if (pendingImport!=null) { deliverImport(pendingImport); pendingImport=null; }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("请确认").setMessage(message)
                    .setPositiveButton("确定",(dialog,which)->result.confirm()).setNegativeButton("取消",(dialog,which)->result.cancel())
                    .setOnCancelListener(dialog->result.cancel()).show(); return true;
            }
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(dialog,which)->result.confirm()).setOnCancelListener(dialog->result.confirm()).show(); return true;
            }
        });
        web.loadUrl(ORIGIN+"index.html");
        if (Build.VERSION.SDK_INT>=33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
    }
    @Override protected void onResume() {
        super.onResume();
        if (web!=null) { web.onResume(); if (ready) call("resume",null); }
        ReportReceiver.WORKER.execute(() -> {
            try { ReportEngine.refresh(getApplicationContext(),true); }
            catch (Exception error) { android.util.Log.e("MoneyManager","Could not refresh reports",error); }
            finally { ReportScheduler.schedule(getApplicationContext()); }
        });
    }
    @Override protected void onPause() { if(web!=null) web.onPause(); super.onPause(); }
    @Override protected void onSaveInstanceState(Bundle state) { state.putString("importType",importType); super.onSaveInstanceState(state); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); if(ready) deliverIntent(); }
    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        if (!ready) { finish(); return; }
        web.evaluateJavascript("window.MoneyManagerNative && window.MoneyManagerNative.back()",value->{ if (!"true".equals(value)) finish(); });
    }
    private void deliverIntent() {
        String kind=getIntent().getStringExtra("reportKind"), period=getIntent().getStringExtra("reportPeriod");
        if (kind==null || period==null) return;
        try { JSONObject data=new JSONObject(); data.put("kind",kind); data.put("period",period); call("report",data); }
        catch(Exception ignored) {}
        getIntent().removeExtra("reportKind"); getIntent().removeExtra("reportPeriod");
    }
    private void call(String method,JSONObject data) {
        if (ready && web!=null) web.evaluateJavascript("window.MoneyManagerNative && window.MoneyManagerNative."+method+"("+(data==null?"":data.toString())+")",null);
    }
    private void message(String text) { runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show()); }
    private void notificationSettings() {
        startActivity(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID,ReportScheduler.CHANNEL));
    }
    private void notifications() {
        String detail="在每月最后一天晚上 9 点生成月度总结并提醒你；12 月 31 日同时提醒查看年度总结。通知中不会显示具体金额。\n\n省电或后台限制可能延迟提醒；再次打开应用时会补齐报告。";
        new AlertDialog.Builder(this).setTitle("总结提醒").setMessage(detail)
            .setPositiveButton(ReportScheduler.enabled(this)?"通知设置":"开启提醒",(dialog,which)-> {
                if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED && (!getPreferences(0).getBoolean("askedNotifications",false)||shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
                    getPreferences(0).edit().putBoolean("askedNotifications",true).apply(); requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);
                } else notificationSettings();
            }).setNeutralButton("后台设置",(dialog,which)->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()))))
            .setNegativeButton("稍后",null).show();
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(request,permissions,results);
        if (request==NOTIFICATIONS) {
            call("resume",null);
            message(ReportScheduler.enabled(this)?"已开启总结提醒":"未开启通知，仍可在“我的 → 总结”查看报告");
            ReportReceiver.WORKER.execute(()->{ try {ReportEngine.refresh(this,true);} catch(Exception ignored){} });
        }
    }
    private void quickShortcut() {
        ShortcutManager manager=getSystemService(ShortcutManager.class);
        if (!manager.isRequestPinShortcutSupported()) { message("请长按“个人记账”图标，再拖动“记一笔”到桌面"); return; }
        ShortcutInfo shortcut=new ShortcutInfo.Builder(this,"pinned_quick_entry").setShortLabel("记一笔").setIcon(Icon.createWithResource(this,R.drawable.ic_launcher))
            .setIntent(new Intent(this,QuickEntryActivity.class).setAction(Intent.ACTION_VIEW)).build();
        manager.requestPinShortcut(shortcut,null);
    }
    public final class Bridge {
        @JavascriptInterface public String read(String key) {
            if (!key.equals(LedgerStore.LEDGER)&&!key.equals(LedgerStore.SETTINGS)&&!key.equals(LedgerStore.REPORTS)) return null;
            return LedgerStore.get(MainActivity.this).read(key);
        }
        @JavascriptInterface public String save(String entries,String settings) {
            try { LedgerStore.get(MainActivity.this).save(entries,settings); return ""; }
            catch(Exception error) { return "保存失败："+error.getMessage(); }
        }
        @JavascriptInterface public boolean notificationEnabled() { return ReportScheduler.enabled(MainActivity.this); }
        @JavascriptInterface public void requestNotifications() { runOnUiThread(()->notifications()); }
        @JavascriptInterface public void addShortcut() { runOnUiThread(()->quickShortcut()); }
        @JavascriptInterface public void exportFile(String name,String content,String type) {
            if(content.length()>20*1024*1024) {message("文件超过 20 MB，无法导出");return;}
            try (FileOutputStream output=openFileOutput(exportCache,MODE_PRIVATE)) {output.write(content.getBytes(StandardCharsets.UTF_8));}
            catch(IOException error) {message("备份准备失败，请检查手机空间");return;}
            runOnUiThread(()->{
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type.startsWith("text/csv")?"text/csv":"application/json").putExtra(Intent.EXTRA_TITLE,name);
                try {startActivityForResult(intent,EXPORT);} catch(ActivityNotFoundException error){message("未找到系统文件选择器");}
            });
        }
        @JavascriptInterface public void importFile(String type) {
            runOnUiThread(()->{
                importType=type.equals("csv")?"csv":"json";
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {startActivityForResult(intent,IMPORT);} catch(ActivityNotFoundException error){message("未找到系统文件选择器");}
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if (result!=RESULT_OK||data==null||data.getData()==null) {if(request==EXPORT) deleteFile(exportCache);return;}
        Uri uri=data.getData();
        ReportReceiver.WORKER.execute(()->{
            try {
                if (request==EXPORT) {
                    try(InputStream input=openFileInput(exportCache); OutputStream output=getContentResolver().openOutputStream(uri,"wt")) {
                        if(output==null) throw new IOException(); byte[] buffer=new byte[8192]; int count;
                        while((count=input.read(buffer))!=-1) output.write(buffer,0,count);
                    }
                    deleteFile(exportCache); message("文件已保存到你选择的位置");
                } else if (request==IMPORT) {
                    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    try(InputStream input=getContentResolver().openInputStream(uri)) {
                        if(input==null) throw new IOException(); byte[] buffer=new byte[8192]; int count;
                        while((count=input.read(buffer))!=-1) {if(bytes.size()+count>20*1024*1024) throw new IOException("文件超过 20 MB"); bytes.write(buffer,0,count);}
                    }
                    String content=bytes.toString("UTF-8");
                    runOnUiThread(()->{if(ready) deliverImport(content);else pendingImport=content;});
                }
            } catch(Exception error) {message("文件操作失败，请检查所选文件和手机空间");}
        });
    }
    private void deliverImport(String content) {
        try {JSONObject data=new JSONObject();data.put("type",importType);data.put("text",content);call("importFile",data);}
        catch(Exception error){message("导入文件读取失败");}
    }
    @Override protected void onDestroy() {
        ready=false;
        if(web!=null) {web.removeJavascriptInterface("AndroidBridge");web.destroy();web=null;}
        super.onDestroy();
    }
}
