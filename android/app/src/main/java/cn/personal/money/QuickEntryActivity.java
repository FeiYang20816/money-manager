package cn.personal.money;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import java.math.BigDecimal;

/** A small native form launched directly from the launcher, without loading the main screen. */
public final class QuickEntryActivity extends Activity {
    private final String[] expense={"餐饮","交通","购物","住房","娱乐","医疗","学习","通讯","日用","其他"};
    private final String[] income={"工资","兼职","退款","理财","其他"};
    private EditText amount,note; private Spinner category; private boolean isIncome;
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll=new ScrollView(this);
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(24),dp(24),dp(24),dp(20));scroll.addView(form);
        TextView title=new TextView(this);title.setText("记一笔");title.setTextSize(24);title.setTextColor(Color.rgb(40,40,39));form.addView(title);
        TextView caption=new TextView(this);caption.setText("随手记录，保存后自动返回");caption.setPadding(0,dp(6),0,dp(16));form.addView(caption);
        RadioGroup types=new RadioGroup(this);types.setOrientation(LinearLayout.HORIZONTAL);
        RadioButton out=new RadioButton(this);out.setId(View.generateViewId());out.setText("支出");types.addView(out);
        RadioButton in=new RadioButton(this);in.setId(View.generateViewId());in.setText("收入");types.addView(in);out.setChecked(true);form.addView(types);
        amount=new EditText(this);amount.setHint("金额 ¥ 0.00");amount.setTextSize(28);amount.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);amount.setSingleLine();amount.setFilters(new InputFilter[]{new InputFilter.LengthFilter(14)});form.addView(amount);
        category=new Spinner(this);setCategories();form.addView(category,new LinearLayout.LayoutParams(-1,dp(56)));
        types.setOnCheckedChangeListener((group,id)->{isIncome=id==in.getId();setCategories();});
        note=new EditText(this);note.setHint("备注（选填）");note.setSingleLine();note.setFilters(new InputFilter[]{new InputFilter.LengthFilter(80)});form.addView(note);
        TextView date=new TextView(this);date.setText("时间自动记录为现在，可在账单中修改");date.setTextSize(12);date.setPadding(0,dp(12),0,dp(12));form.addView(date);
        Button save=new Button(this);save.setText("保存这笔账");save.setTextColor(Color.WHITE);save.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(232,81,87)));form.addView(save);
        Button cancel=new Button(this);cancel.setText("取消");form.addView(cancel);cancel.setOnClickListener(view->finish());
        save.setOnClickListener(view->save());
        setContentView(scroll);getWindow().setLayout(-1,-2);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        if(state!=null) {in.setChecked(state.getBoolean("income"));amount.setText(state.getString("amount",""));note.setText(state.getString("note",""));category.setSelection(state.getInt("category",0));}
        amount.requestFocus();
    }
    private void setCategories(){ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,isIncome?income:expense);category.setAdapter(adapter);}
    private void save(){
        String value=amount.getText().toString().trim();
        if(!value.matches("\\d+(\\.\\d{1,2})?")) {amount.setError("请输入金额，最多两位小数");return;}
        try {
            long cents=new BigDecimal(value).movePointRight(2).longValueExact();
            if(cents<=0) {amount.setError("金额必须大于零");return;}
            LedgerStore.get(this).add(isIncome?"income":"expense",cents,category.getSelectedItem().toString(),note.getText().toString().trim());
            ReportScheduler.channel(this);ReportScheduler.schedule(this);
            ReportReceiver.WORKER.execute(()->{try{ReportEngine.refresh(getApplicationContext(),true);}catch(Exception ignored){}});
            Toast.makeText(this,"已保存",Toast.LENGTH_SHORT).show();finish();
        } catch(Exception error){amount.setError("未能保存："+error.getMessage());}
    }
    @Override protected void onSaveInstanceState(Bundle state){state.putBoolean("income",isIncome);state.putString("amount",amount.getText().toString());state.putString("note",note.getText().toString());state.putInt("category",category.getSelectedItemPosition());super.onSaveInstanceState(state);}
}
