/* http://hg.python.org/cpython/file/c9e9142d82d6/Modules/_datetimemodule.c#l249 */
const DI4Y = 1461 /* days in 4 years */
const DI100Y = 36524 /* days in 100 years */
const DI400Y = 146097 /* days in 400 years */
const _days_before_month = [0,0,31,59,90,120,151,181,212,243,273,304,334]

function days_in_month(year, month)                             {
    return (month==2 &&
            (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0))) ?
            29 : [0,31,28,31,30,31,30,31,31,30,31,30,31][month] }

exports.parseOTTDDate = function(ordinal) {
    ordinal -= 365; // I think
    var year,month,day, n, n1, n4, n100, n400, leapyear, preceding;
    /* ordinal is a 1-based index, starting at 1-Jan-1. The pattern of
    * leap years repeats exactly every 400 years. The basic strategy is
    * to find the closest 400-year boundary at or before ordinal, then
    * work with the offset from that boundary to ordinal. Life is much
    * clearer if we subtract 1 from ordinal first -- then the values
    * of ordinal at 400-year boundaries are exactly those divisible
    * by DI400Y:
    *
    * D M Y n n-1
    * -- --- ---- ---------- ----------------
    * 31 Dec -400 -DI400Y -DI400Y -1
    * 1 Jan -399 -DI400Y +1 -DI400Y 400-year boundary
    * ...
    * 30 Dec 000 -1 -2
    * 31 Dec 000 0 -1
    * 1 Jan 001 1 0 400-year boundary
    * 2 Jan 001 2 1
    * 3 Jan 001 3 2
    * ...
    * 31 Dec 400 DI400Y DI400Y -1
    * 1 Jan 401 DI400Y +1 DI400Y 400-year boundary
    */
    --ordinal;
    n400 = ~~(ordinal / DI400Y);
    n = ordinal % DI400Y;
    year = n400 * 400 + 1;
    /* Now n is the (non-negative) offset, in days, from January 1 of
    * year, to the desired date. Now compute how many 100-year cycles
    * precede n.
    * Note that it's possible for n100 to equal 4! In that case 4 full
    * 100-year cycles precede the desired day, which implies the
    * desired day is December 31 at the end of a 400-year cycle.
    */
    n100 = ~~(n / DI100Y);
    n = n % DI100Y;

    /* Now compute how many 4-year cycles precede it. */
    n4 = ~~(n / DI4Y);
    n = n % DI4Y;

    /* And now how many single years. Again n1 can be 4, and again
    * meaning that the desired day is December 31 at the end of the
    * 4-year cycle.
    */
    n1 = ~~(n / 365);
    n = n % 365;

    year += n100 * 100 + n4 * 4 + n1;
    if (n1 == 4 || n100 == 4) {
        return new Date((new Date(0)).setUTCFullYear(year-1, 11, 31));
    }
    /* Now the year is correct, and n is the offset from January 1. We
    * find the month via an estimate that's either exact or one too
    * large.
    */
    leapyear = n1 == 3 && (n4 != 24 || n100 == 3);
    //assert(leapyear == is_leap(*year));
    month = (n + 50) >> 5;
    preceding = (_days_before_month[month] + (month > 2 && leapyear));
    if (preceding > n) {
        /* estimate is too large */
        month -= 1;
        preceding -= days_in_month(year, month);
    }
    n -= preceding;
    //assert(0 <= n);
    //assert(n < days_in_month(year, month));

    day = n + 1;
    var d = new Date(0);
    d.setUTCFullYear(year, month-1, day);
    return d;
}
