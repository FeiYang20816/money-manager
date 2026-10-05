package cn.personal.money;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ReportReceiver extends BroadcastReceiver {
    static final ExecutorService WORKER=Executors.newSingleThreadExecutor();
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result=goAsync();
        WORKER.execute(() -> {
            try { ReportScheduler.channel(context); ReportEngine.refresh(context,true); }
            catch (Exception error) { Log.e("MoneyManager","Summary generation failed",error); }
            finally { try { ReportScheduler.schedule(context); } finally { result.finish(); } }
        });
    }
}
