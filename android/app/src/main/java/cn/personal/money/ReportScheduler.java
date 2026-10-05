package cn.personal.money;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import java.time.ZonedDateTime;
import java.time.LocalTime;

public final class ReportScheduler {
    public static final String CHANNEL="summary_reports";
    private ReportScheduler() {}
    public static void channel(Context context) {
        NotificationChannel channel=new NotificationChannel(CHANNEL,"月度与年度总结",NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("月末、年末总结生成后提醒查看");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    public static boolean enabled(Context context) {
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        NotificationChannel channel=manager.getNotificationChannel(CHANNEL);
        return manager.areNotificationsEnabled() && channel!=null && channel.getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    public static void schedule(Context context) {
        ZonedDateTime now=ZonedDateTime.now(), next=now.with(LocalTime.of(21,0));
        if (!next.isAfter(now)) next=next.plusDays(1);
        PendingIntent pending=PendingIntent.getBroadcast(context,10,new Intent(context,ReportReceiver.class).setAction("cn.personal.money.CHECK_REPORTS"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.toInstant().toEpochMilli(),pending);
    }
    public static void notifyReport(Context context, String kind, String period) {
        LedgerStore store=LedgerStore.get(context); String key="notified:"+kind+":"+period;
        if (store.read(key)!=null) return;
        Intent intent=new Intent(context,MainActivity.class).setAction("cn.personal.money.OPEN_REPORT").putExtra("reportKind",kind).putExtra("reportPeriod",period).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int id=kind.equals("yearly")?202:201;
        PendingIntent open=PendingIntent.getActivity(context,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(context,CHANNEL).setSmallIcon(R.drawable.ic_notification).setColor(Color.rgb(232,81,87))
            .setContentTitle(period+(kind.equals("yearly")?" 年度总结已生成":" 月度总结已生成"))
            .setContentText(kind.equals("yearly")?"点击回顾本年收支与盈余。":"点击查看本月收支及奢侈消费明细。")
            .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).build();
        try { context.getSystemService(NotificationManager.class).notify(id,notification); store.write(key,"1"); }
        catch (SecurityException ignored) { /* Remains pending until permission is enabled. */ }
    }
}
