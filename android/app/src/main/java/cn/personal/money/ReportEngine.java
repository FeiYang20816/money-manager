package cn.personal.money;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.TreeMap;
import java.util.Map;

public final class ReportEngine {
    private ReportEngine() {}
    public static boolean luxury(JSONObject item) {
        return item.optString("type").equals("expense") && item.optLong("amountCents") > 5000 && !campus(item);
    }
    public static boolean campus(JSONObject item) {
        return item.optString("type").equals("expense") && item.optLong("amountCents") > 5000 && item.optString("note").replaceAll("(?U)\\s+", "").contains("校园卡");
    }
    public static JSONObject summarize(JSONArray entries, String period, boolean annual) throws Exception {
        long income=0, expense=0, luxuryAmount=0; int luxuryCount=0, campusCount=0;
        TreeMap<String, Long> categories = new TreeMap<>(); TreeMap<String, Long> months = new TreeMap<>();
        for (int i=0; i<entries.length(); i++) {
            JSONObject item = entries.getJSONObject(i); String time=item.getString("occurredAt");
            if (!time.startsWith(period)) continue;
            long amount=item.getLong("amountCents");
            if (item.getString("type").equals("income")) income+=amount;
            else {
                expense+=amount;
                String category=item.getString("category"), month=time.substring(0,7);
                categories.put(category, categories.getOrDefault(category,0L)+amount);
                months.put(month, months.getOrDefault(month,0L)+amount);
            }
            if (luxury(item)) { luxuryCount++; luxuryAmount+=amount; }
            if (campus(item)) campusCount++;
        }
        JSONObject report=new JSONObject();
        report.put("income",income); report.put("expense",expense); report.put("surplus",income-expense);
        report.put("luxuryCount",luxuryCount); report.put("luxuryAmount",luxuryAmount); report.put("campusCount",campusCount);
        String top=null; long topAmount=0;
        for (Map.Entry<String,Long> item: (annual ? months : categories).entrySet()) {
            if (item.getValue()>topAmount) { top=item.getKey(); topAmount=item.getValue(); }
        }
        if (annual) { report.put("peakMonth",top==null?JSONObject.NULL:top); report.put("peakAmount",topAmount); }
        else {
            JSONObject category=new JSONObject(); category.put("name",top); category.put("amount",topAmount);
            report.put("topCategory",top==null?JSONObject.NULL:category);
        }
        return report;
    }
    /** Recompute completed periods before notification; late edits remain reflected. */
    public static synchronized void refresh(Context context, boolean notify) throws Exception {
        LedgerStore store=LedgerStore.get(context);
        synchronized (store) {
            JSONArray entries=store.entries(); JSONObject settings=store.settings();
            YearMonth first=YearMonth.parse(settings.getString("trackingStartMonth"));
            for (int i=0;i<entries.length();i++) {
                YearMonth month=YearMonth.parse(entries.getJSONObject(i).getString("occurredAt").substring(0,7));
                if (month.isBefore(first)) first=month;
            }
            LocalDateTime now=LocalDateTime.now(); LocalDate today=now.toLocalDate(); YearMonth current=YearMonth.from(today);
            YearMonth last=today.getDayOfMonth()==current.lengthOfMonth()?current:current.minusMonths(1);
            JSONObject monthly=new JSONObject(), yearly=new JSONObject();
            for (YearMonth cursor=first; !cursor.isAfter(last);cursor=cursor.plusMonths(1)) {
                monthly.put(cursor.toString(),summarize(entries,cursor.toString(),false));
            }
            int lastYear=today.getMonthValue()==12 && today.getDayOfMonth()==31?today.getYear():today.getYear()-1;
            for (int year=first.getYear();year<=lastYear;year++) yearly.put(String.valueOf(year),summarize(entries,String.valueOf(year),true));
            JSONObject reports=new JSONObject(); reports.put("monthly",monthly); reports.put("yearly",yearly);
            store.write(LedgerStore.REPORTS,reports.toString());
            if (!notify || !ReportScheduler.enabled(context)) return;
            // The final day's evening snapshot is refreshed on later edits and on the next day.
            YearMonth due=today.getDayOfMonth()==current.lengthOfMonth() && now.getHour()>=21?current:current.minusMonths(1);
            if (!due.isBefore(first) && monthly.has(due.toString())) ReportScheduler.notifyReport(context,"monthly",due.toString());
            int dueYear=today.getMonthValue()==12 && today.getDayOfMonth()==31 && now.getHour()>=21?today.getYear():today.getYear()-1;
            if (dueYear>=first.getYear() && yearly.has(String.valueOf(dueYear))) ReportScheduler.notifyReport(context,"yearly",String.valueOf(dueYear));
        }
    }
}
