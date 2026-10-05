package cn.personal.money;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.UUID;

/** All entry points (screen, quick entry and reports) share this private SQLite store. */
public final class LedgerStore extends SQLiteOpenHelper {
    public static final String LEDGER = "money-manager-web-v1";
    public static final String SETTINGS = "money-manager-web-settings-v1";
    public static final String REPORTS = "money-manager-web-reports-v1";
    private static LedgerStore instance;
    public static synchronized LedgerStore get(Context context) {
        if (instance == null) instance = new LedgerStore(context.getApplicationContext());
        return instance;
    }
    private LedgerStore(Context context) {
        super(context, "money-manager.db", null, 1);
        synchronized (this) {
            if (read(LEDGER) == null) write(LEDGER, "[]");
            if (read(SETTINGS) == null) write(SETTINGS, "{\"openingAssetCents\":0,\"trackingStartMonth\":\"" + YearMonth.now() + "\"}");
        }
    }
    @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE kv (name TEXT PRIMARY KEY, value TEXT NOT NULL)"); }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { /* v1 has no migrations yet. */ }
    public synchronized String read(String key) {
        // Read chunks so a large ledger does not exceed Android's CursorWindow row size.
        SQLiteDatabase db=getReadableDatabase(); int length;
        try (Cursor cursor=db.rawQuery("SELECT length(value) FROM kv WHERE name=?",new String[]{key})) {
            if (!cursor.moveToFirst()) return null;
            length=cursor.getInt(0);
        }
        StringBuilder result=new StringBuilder(length);
        for (int offset=1;offset<=length;offset+=131072) {
            try (Cursor cursor=db.rawQuery("SELECT substr(value,?,131072) FROM kv WHERE name=?",new String[]{String.valueOf(offset),key})) {
                if (!cursor.moveToFirst()) throw new IllegalStateException("账本读取失败");
                result.append(cursor.getString(0));
            }
        }
        return result.toString();
    }
    public synchronized void write(String key, String value) {
        ContentValues row = new ContentValues(); row.put("name", key); row.put("value", value);
        if (getWritableDatabase().insertWithOnConflict("kv", null, row, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new IllegalStateException("保存失败，请检查手机空间");
    }
    public synchronized JSONArray entries() throws Exception { return new JSONArray(read(LEDGER)); }
    public synchronized JSONObject settings() throws Exception { return new JSONObject(read(SETTINGS)); }

    public static void validate(JSONArray entries, JSONObject settings) throws Exception {
        long asset = settings.getLong("openingAssetCents");
        if (Math.abs(asset) > 9007199254740991L) throw new IllegalArgumentException("期初资产金额过大");
        YearMonth.parse(settings.getString("trackingStartMonth"));
        HashSet<String> ids = new HashSet<>();
        long total = Math.abs(asset);
        for (int i=0; i<entries.length(); i++) {
            JSONObject item = entries.getJSONObject(i);
            String id = item.getString("id");
            if (!id.matches("[A-Za-z0-9_-]{1,80}") || !ids.add(id)) throw new IllegalArgumentException("账单编号无效或重复");
            String type = item.getString("type");
            if (!type.equals("income") && !type.equals("expense")) throw new IllegalArgumentException("账单类型无效");
            double cents = item.getDouble("amountCents");
            if (cents <= 0 || cents != Math.rint(cents) || cents > 9007199254740991L) throw new IllegalArgumentException("账单金额无效");
            total = Math.addExact(total, (long)cents);
            if (total > 9007199254740991L) throw new IllegalArgumentException("累计金额超过支持范围");
            String time = item.getString("occurredAt");
            if (!time.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}")) throw new IllegalArgumentException("日期格式无效");
            LocalDateTime.parse(time);
            if (item.getString("note").length()>80 || item.getString("category").length()>30) throw new IllegalArgumentException("备注或分类过长");
        }
    }
    public synchronized void save(String entriesText, String settingsText) throws Exception {
        if (entriesText.length() > 20 * 1024 * 1024) throw new IllegalArgumentException("账本超过 20 MB");
        JSONArray entries = new JSONArray(entriesText); JSONObject settings = new JSONObject(settingsText);
        validate(entries, settings);
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try { write(LEDGER, entries.toString()); write(SETTINGS, settings.toString()); db.setTransactionSuccessful(); }
        finally { db.endTransaction(); }
    }
    public synchronized void add(String type, long cents, String category, String note) throws Exception {
        JSONArray entries = entries();
        JSONObject entry = new JSONObject();
        entry.put("id", UUID.randomUUID().toString()); entry.put("type", type);
        entry.put("amountCents", cents); entry.put("category", category); entry.put("note", note);
        entry.put("occurredAt", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")));
        entries.put(entry); save(entries.toString(), settings().toString());
    }
}
