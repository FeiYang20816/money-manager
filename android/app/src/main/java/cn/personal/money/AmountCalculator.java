package cn.personal.money;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Evaluates a simple amount expression exactly, then rounds once to cents. */
final class AmountCalculator {
    private static final Pattern NUMBER = Pattern.compile("\\d{1,12}(?:\\.\\d{1,2})?");
    private static final BigInteger MAX_CENTS = BigInteger.valueOf(9007199254740991L);

    private static final class Fraction {
        final BigInteger n, d;
        Fraction(BigInteger n, BigInteger d) { this.n=n; this.d=d; }
        Fraction add(Fraction b) { return new Fraction(n.multiply(b.d).add(b.n.multiply(d)),d.multiply(b.d)); }
        Fraction multiply(Fraction b) { return new Fraction(n.multiply(b.n),d.multiply(b.d)); }
        Fraction divide(Fraction b) {
            if (b.n.signum()==0) throw new IllegalArgumentException("不能除以零");
            return new Fraction(n.multiply(b.d),d.multiply(b.n));
        }
        Fraction negative() { return new Fraction(n.negate(),d); }
    }

    static long evaluate(String source) {
        String input=source.replaceAll("\\s+","").replace('×','*').replace('÷','/');
        if (input.isEmpty() || input.length()>80) throw new IllegalArgumentException("请输入金额（最多 80 个字符）");
        Fraction total=new Fraction(BigInteger.ZERO,BigInteger.ONE), term=null;
        char pending='+';
        int position=0;
        while (position<input.length()) {
            Matcher matcher=NUMBER.matcher(input);matcher.region(position,input.length());
            if (!matcher.lookingAt()) throw new IllegalArgumentException("请输入完整算式，每个数字最多两位小数");
            String digits=matcher.group();position=matcher.end();
            int dot=digits.indexOf('.');
            Fraction value=dot<0 ? new Fraction(new BigInteger(digits),BigInteger.ONE)
                : new Fraction(new BigInteger(digits.substring(0,dot)+digits.substring(dot+1)),BigInteger.TEN.pow(digits.length()-dot-1));
            if (pending=='*' || pending=='/') term=pending=='*'?term.multiply(value):term.divide(value);
            else {
                if (term!=null) total=total.add(term);
                term=pending=='-'?value.negative():value;
            }
            if (position==input.length()) break;
            pending=input.charAt(position++);
            if ("+-*/".indexOf(pending)<0 || position==input.length()) throw new IllegalArgumentException("请输入完整算式");
        }
        total=total.add(term);
        if (total.n.signum()<=0) throw new IllegalArgumentException("金额必须大于零");
        BigInteger[] parts=total.n.multiply(BigInteger.valueOf(100)).divideAndRemainder(total.d);
        BigInteger cents=parts[0].add(parts[1].multiply(BigInteger.valueOf(2)).compareTo(total.d)>=0?BigInteger.ONE:BigInteger.ZERO);
        if (cents.signum()==0) throw new IllegalArgumentException("计算结果不足 0.01 元");
        if (cents.compareTo(MAX_CENTS)>0) throw new IllegalArgumentException("金额过大");
        return cents.longValueExact();
    }
    static String format(long cents) { return BigDecimal.valueOf(cents,2).toPlainString(); }
}
