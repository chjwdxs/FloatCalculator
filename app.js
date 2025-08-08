/**
 * Float32 数学函数计算器
 * 目标：所有计算强制以 Float32 收敛；fma 使用 fround 近似；提供十六进制位型显示与内置测试。
 * 新增：输入可为十进制或 Float32 十六进制位型（如 0x3f800000 或 3f800000）。
 *
 * 架构说明：
 * - f32(x): 用 Math.fround 将值收敛为 float32
 * - bitsF32(x): 将 float32 的位型显示为 0xhhhhhhhh
 * - parseF32Input(str): 支持十进制与 32 位十六进制位型解析为 float32
 * - 所有函数实现以 float32 为主；必要时先以 Number 计算再 f32 收敛
 * - 特殊函数（lgamma/erf/Bessel I/J/Y）采用经典近似/级数/渐近展开，目标为 float32 精度
 */

// 基础工具
// 使用共享缓冲区进行“位级 Float32/Float64 收敛”，以稳定产生/保留 subnormal
const __f32bufF = new Float32Array(1);
const __f32bufU = new Uint32Array(__f32bufF.buffer);
const __f64bufF = new Float64Array(1);
const __f64bufU = new BigUint64Array(__f64bufF.buffer);
function toF32Strict(x){
  __f32bufF[0] = Number(x);
  return __f32bufF[0];
}
function toF64Strict(x){
  __f64bufF[0] = Number(x);
  return __f64bufF[0];
}
// 兼容旧名
const f32 = (x) => toF32Strict(x);
const f64 = (x) => toF64Strict(x);

// 基础 Float32 运算包装，确保每一步都在 Float32 域收敛
function fadd(a,b){ __f32bufF[0]=a; const ax=__f32bufF[0]; __f32bufF[0]=b; const bx=__f32bufF[0]; __f32bufF[0]=ax+bx; return __f32bufF[0]; }
function fsub(a,b){ __f32bufF[0]=a; const ax=__f32bufF[0]; __f32bufF[0]=b; const bx=__f32bufF[0]; __f32bufF[0]=ax-bx; return __f32bufF[0]; }
function fmul(a,b){ __f32bufF[0]=a; const ax=__f32bufF[0]; __f32bufF[0]=b; const bx=__f32bufF[0]; __f32bufF[0]=ax*bx; return __f32bufF[0]; }
function fdiv(a,b){ __f32bufF[0]=a; const ax=__f32bufF[0]; __f32bufF[0]=b; const bx=__f32bufF[0]; __f32bufF[0]=ax/bx; return __f32bufF[0]; }
function ffma(a,b,c){ return fadd(fmul(a,b), c); }

// 支持：十进制 或 Float32 十六进制位型（0x???????? 或 ????????）
function parseF32Input(str) {
  if (typeof str !== "string") return NaN;
  const v = str.trim();
  if (v === "") return NaN;
  // 匹配十六进制位型：可带 0x/0X 前缀或纯 8 位十六进制
  const m = /^(?:0x)?([0-9a-fA-F]{1,8})$/.exec(v);
  if (m) {
    const hex = m[1].padStart(8,"0");
    const u = new Uint32Array(1);
    const f = new Float32Array(u.buffer);
    u[0] = parseInt(hex, 16) >>> 0;
    return f32(f[0]);
  }
  // 其他按十进制/科学计数法解析
  const n = Number(v);
  return Number.isNaN(n) ? NaN : f32(n);
}
const toF32 = (x) => f32(Number(x)); // 已被 parseF32Input 替代，但保留以兼容内部调用
const isFiniteNumber = (x) => Number.isFinite(x);
const clampExpInt = (e) => (e|0); // ldexp 的指数输入按整数解析

function bitsF32(x) {
  __f32bufF[0] = f32(x);
  const v = __f32bufU[0] >>> 0;
  return "0x" + v.toString(16).padStart(8, "0");
}
// Float64 位型展示（返回 BigInt 十六进制字符串）
function bitsF64(x) {
  __f64bufF[0] = f64(x);
  const v = __f64bufU[0]; // BigInt
  const hex = v.toString(16).padStart(16,"0");
  return "0x" + hex;
}

function sciStr(x) {
  if (!Number.isFinite(x)) return String(x);
  // 提升到 15 位有效数字
  const s = x.toExponential(15);
  // 指数位统一两位以上宽度
  return s.replace(/e([+-]?)(\d+)/i, (_, sgn, d) => `e${sgn}${d.padStart(2,"0")}`);
}

/* ===== 生成 C/C++ 源码：支持 float32/float64，按当前类型输出 ===== */
function bitsHex32FromNumber(x){
  const u = u32Of(f32(x));
  return "0x" + u.toString(16).padStart(8,"0");
}
function bitsHex64FromNumber(x){
  const u = u64Of(f64(x)); // BigInt
  return "0x" + u.toString(16).padStart(16,"0");
}
function generateCSourceFromCurrent(){
  // 兼容旧入口，默认生成 C++ 版本
  return generateCppSourceFromCurrent();
}
function generateCppSourceFromCurrent(){
  // 取当前函数与输入
  const sel = document.getElementById("func");
  const fnKey = sel ? sel.value : "";
  const meta = (FunctionMeta||[]).find(m => m.key === fnKey) || { args: [] };

  // 读取 a/b/c/exp
  const snap = (window.readCurrentInputsSnapshot ? window.readCurrentInputsSnapshot(fnKey) : {});
  const aval = snap?.a?.value ?? 0;
  const bval = snap?.b?.value ?? 0;
  const cval = snap?.c?.value ?? 0;
  const eexp = (snap?.exp != null && snap.exp !== "") ? (parseInt(String(snap.exp),10)|0) : 0;

  // 根据当前类型准备位型常量
  const ntype = (typeof getNumericType==="function") ? getNumericType() : "f32";
  const isF64 = ntype === "f64";
  const hexA = isF64 ? bitsHex64FromNumber(aval) : bitsHex32FromNumber(aval);
  const hexB = isF64 ? bitsHex64FromNumber(bval) : bitsHex32FromNumber(bval);
  const hexC = isF64 ? bitsHex64FromNumber(cval) : bitsHex32FromNumber(cval);

  // 构造核心表达式（C++ 版本）
  let expr = cppExprFor(fnKey);
  // 在 f64 下，去除少量硬编码的 float 字面量后缀，以便走 double 重载
  if (isF64) {
    expr = expr
      .replace(/\(float\)/g, "")
      .replace(/([0-9]+\.[0-9]*)f\b/g, "$1")
      .replace(/([0-9])f\b/g, "$1");
  }

  // 特殊多返回的函数：modf、frexp、sincos 单独生成
  if (fnKey === "modf") return buildCPPForModf(hexA, isF64);
  if (fnKey === "frexp") return buildCPPForFrexp(hexA, isF64);
  if (fnKey === "sincos") return buildCPPForSincos(hexA, isF64);

  // 三元 fma
  const needsC = fnKey === "fma";
  // 二元带指数（scalbn/scalbln/ldexp）
  const needsExp = fnKey === "scalbn" || fnKey === "scalbln" || fnKey === "ldexp";

  // 精确判定是否需要 b（表达式级别），以及常见二元函数集
  const binaryKeys = new Set(["add","sub","mul","div","pow","fmod","atan2","nextafter","copysign","fdim","fmax","fmin","hypot"]);
  let needsB = binaryKeys.has(fnKey);

  // 保险：解析表达式字符串中是否出现了 'b' 标识符
  if (!needsB) {
    const bIdentRE = /(^|[^A-Za-z0-9_])b([^A-Za-z0-9_]|$)/;
    if (bIdentRE.test(expr)) needsB = true;
  }

  // 判断表达式是否使用到 invnorm/erfcinv 辅助
  const needsErfcinv = /__erfcinv_inline\(/.test(expr);
  // 判断是否需要 f64 打印工具
  const needsF64 = isF64;
  // 判断是否需要十六进制位型工具：只有当我们打印/回显时需要
  const wantsEcho = true; // 仍保留输入/输出打印
  // 生成按需最小化头部
  const header = buildCPPHeaderMin({
    needsF64,
    needsErfcinv,
    wantsEcho
  });

  return buildCPPStandardMin({
    header,
    expr,
    fnKey,
    hexA, hexB, hexC,
    needsB,
    needsC,
    needsExp,
    expVal: eexp,
    isF64,
    wantsEcho
  });
}
function cExprFor(fnKey){
  switch(fnKey){
    // 基础
    case "add": return "a + b";
    case "sub": return "a - b";
    case "mul": return "a * b";
    case "div": return "a / b";
    case "fma": return "fmaf(a,b,c)";
    case "sqrt": return "sqrtf(a)";
    case "rsqrt": return "1.0f/sqrtf(a)";
    case "fmod": return "fmodf(a,b)";
    case "pow": return "powf(a,b)";
    case "ldexp": return "ldexpf(a, expi)";
    // 指数对数
    case "exp": return "expf(a)";
    case "exp2": return "exp2f(a)";
    case "exp10": return "powf(10.0f,a)";
    case "expm1": return "expm1f(a)";
    case "log": return "logf(a)";
    case "log2": return "log2f(a)";
    case "log10": return "log10f(a)";
    case "log1p": return "log1pf(a)";
    // 三角/双曲
    case "sin": return "sinf(a)";
    case "cos": return "cosf(a)";
    case "tan": return "tanf(a)";
    case "sinh": return "sinhf(a)";
    case "cosh": return "coshf(a)";
    case "tanh": return "tanhf(a)";
    case "asin": return "asinf(a)";
    case "acos": return "acosf(a)";
    case "atan": return "atanf(a)";
    case "atan2": return "atan2f(a,b)";
    // π 缩放
    case "sinpi": return "sinf(a * (float)M_PI)";
    case "cospi": return "cosf(a * (float)M_PI)";
    // 倒数三角
    case "sec": return "1.0f / cosf(a)";
    case "csc": return "1.0f / sinf(a)";
    case "cot": return "1.0f / tanf(a)";
    // 反双曲
    case "asinh": return "asinhf(a)";
    case "acosh": return "acoshf(a)";
    case "atanh": return "atanhf(a)";
    // 特殊函数（库可用性依赖编译器）
    case "j0": return "j0f(a)";
    case "j1": return "j1f(a)";
    case "y0": return "y0f(a)";
    case "y1": return "y1f(a)";
    case "i0": return "/* 无标准 i0f，可用近似库；此处占位 */ (/*i0f*/ a)";
    case "i1": return "/* 无标准 i1f，可用近似库；此处占位 */ (/*i1f*/ a)";
    case "erf": return "erff(a)";
    case "lgamma": return "lgammaf(a)";
    case "tgamma": return "tgammaf(a)";
    // IEEE 工具
    case "abs": return "fabsf(a)";
    case "copysign": return "copysignf(a,b)";
    case "fdim": return "fdimf(a,b)";
    case "fmax": return "fmaxf(a,b)";
    case "fmin": return "fminf(a,b)";
    case "hypot": return "hypotf(a,b)";
    case "trunc": return "truncf(a)";
    case "floor": return "floorf(a)";
    case "ceil": return "ceilf(a)";
    case "round": return "roundf(a)";
    case "rint": return "rintf(a)";
    case "ilogb": return "(float)ilogbf(a)"; // 我们打印 float，便于与本页展示对齐
    case "logb": return "logbf(a)";
    case "scalbn": return "scalbnf(a, expi)";
    case "scalbln": return "scalblnf(a, expi)";
    case "nextafter": return "nextafterf(a,b)";
    case "isnan": return "(float)isnan(a)";
    case "isinf": return "(float)isinf(a)";
    case "isfinite": return "(float)isfinite(a)";
    case "signbit": return "(float)signbit(a)";
    // 复合/多返回，单独模板
    case "modf": return "__MODF__";
    case "frexp": return "__FREXP__";
    case "sincos": return "__SINCOS__";
    default: return "/* 未映射，回退打印 a */ a";
  }
}

/* C++ 版本表达式映射（优先使用 std:: 与 float 专用重载） */
function cppExprFor(fnKey){
  switch(fnKey){
    // 基础
    case "add": return "a + b";
    case "sub": return "a - b";
    case "mul": return "a * b";
    case "div": return "a / b";
    case "fma": return "std::fma(a,b,c)"; // C++11
    case "sqrt": return "std::sqrt(a)";
    case "rsqrt": return "1.0f/std::sqrt(a)";
    case "fmod": return "std::fmod(a,b)";
    case "pow": return "std::pow(a,b)";
    case "ldexp": return "std::ldexp(a, expi)";
    // 指数对数
    case "exp": return "std::exp(a)";
    case "exp2": return "std::exp2(a)";
    case "exp10": return "std::pow(10.0f,a)";
    case "expm1": return "std::expm1(a)";
    case "log": return "std::log(a)";
    case "log2": return "std::log2(a)";
    case "log10": return "std::log10(a)";
    case "log1p": return "std::log1p(a)";
    // 三角/双曲
    case "sin": return "std::sin(a)";
    case "cos": return "std::cos(a)";
    case "tan": return "std::tan(a)";
    case "sinh": return "std::sinh(a)";
    case "cosh": return "std::cosh(a)";
    case "tanh": return "std::tanh(a)";
    case "asin": return "std::asin(a)";
    case "acos": return "std::acos(a)";
    case "atan": return "std::atan(a)";
    case "atan2": return "std::atan2(a,b)";
    // π 缩放
    case "sinpi": return "std::sin(a * (float)M_PI)";
    case "cospi": return "std::cos(a * (float)M_PI)";
    // 倒数三角
    case "sec": return "1.0f / std::cos(a)";
    case "csc": return "1.0f / std::sin(a)";
    case "cot": return "1.0f / std::tan(a)";
    // 反双曲
    case "asinh": return "std::asinh(a)";
    case "acosh": return "std::acosh(a)";
    case "atanh": return "std::atanh(a)";
    // 特殊函数（依赖实现，常见 libstdc++/glibc 支持）
    case "j0": return "::j0f(a)";
    case "j1": return "::j1f(a)";
    case "y0": return "::y0f(a)";
    case "y1": return "::y1f(a)";
    // C++17 起在很多实现中提供了 std::cyl_bessel_i 与 std::cyl_bessel_j/Y（以双精度为主），
    // 但 i0/i1 可由 std::cyl_bessel_i(nu,x) 在整数阶下得到。这里以 float 强制收敛。
    case "i0": return "(float)std::cyl_bessel_i(0.0f, a)";
    case "i1": return "(float)std::cyl_bessel_i(1.0f, a)";
    case "erf": return "std::erf(a)";
    // 新增映射：互补误差函数族与正态逆
    case "erfc": return "std::erfc(a)";
    // erfcx(x) = exp(x*x) * erfc(x)
    case "erfcx": return "std::exp(a*a) * std::erfc(a)";
    // erfcinv(y): 无标准库，使用关系 erfcinv(y) = -invnorm(y/2)/sqrt(2)
    // 其中 invnorm = std::erfcinv 变体不可用，改用 ::erfcinv 缺失时，退化为 Moro 近似不可取；
    // 这里采用以 std::erfc 的关系：invnorm(p) = -sqrt(2)*erfcinv(2p)，反解得到：
    // erfcinv(y) = -std::sqrt(2) * 0.5 * std::erfcinv??(y) 不可行。改走常用近似：
    // 直接用 probit 近似：invnorm(u) ≈ rational_approx(u)，然后缩放。
    // 为了生成的代码可独立编译，我们内联一个近似函数 __invnorm(u) 并引用。
    case "erfcinv": return "__erfcinv_inline(a)";
    // normcdfinv(p) = -sqrt(2) * erfcinv(2p)
    case "normcdfinv": return "(-std::sqrt(2.0f)) * __erfcinv_inline(2.0f*a)";
    case "lgamma": return "std::lgamma(a)";
    case "tgamma": return "std::tgamma(a)";
    // IEEE 工具
    case "abs": return "std::fabs(a)";
    case "copysign": return "std::copysign(a,b)";
    case "fdim": return "std::fdim(a,b)";
    case "fmax": return "std::fmax(a,b)";
    case "fmin": return "std::fmin(a,b)";
    case "hypot": return "std::hypot(a,b)";
    case "trunc": return "std::trunc(a)";
    case "floor": return "std::floor(a)";
    case "ceil": return "std::ceil(a)";
    case "round": return "std::round(a)";
    case "rint": return "std::rint(a)";
    case "ilogb": return "(float)std::ilogb(a)";
    case "logb": return "std::logb(a)";
    case "scalbn": return "std::scalbn(a, expi)";
    case "scalbln": return "std::scalbln(a, expi)";
    case "nextafter": return "std::nextafter(a,b)";
    case "isnan": return "(float)std::isnan(a)";
    case "isinf": return "(float)std::isinf(a)";
    case "isfinite": return "(float)std::isfinite(a)";
    case "signbit": return "(float)std::signbit(a)";
    // 复合/多返回，单独模板
    case "modf": return "__MODF__";
    case "frexp": return "__FREXP__";
    case "sincos": return "__SINCOS__";
    default: return "/* 未映射，回退打印 a */ a";
  }
}
function buildCHeader(){
  // C 版本保留（兼容），但默认走 C++ 生成
  return [
    "#include <stdio.h>",
    "#include <stdint.h>",
    "#include <math.h>",
    "",
    "static float f32_from_bits(uint32_t u){ union { uint32_t u; float f; } v; v.u=u; return v.f; }",
    "static uint32_t bits_from_f32(float f){ union { uint32_t u; float f; } v; v.f=f; return v.u; }",
    "static void print_f32(const char* name, float x){",
    "  uint32_t u = bits_from_f32(x);",
    "  printf(\"%s = %.*g | %.*e | 0x%08x\\n\", name, 15, (double)x, 15, (double)x, (unsigned)u);",
    "}",
    ""
  ].join("\n");
}
function buildCStandard(opts){
  const {expr, fnKey, hexA, hexB, hexC, needsB, needsC, needsExp, expVal} = opts;
  const body = [];
  body.push(buildCHeader());
  body.push("int main(){");
  body.push(`  float a = f32_from_bits(${hexA});`);
  if (needsB) body.push(`  float b = f32_from_bits(${hexB});`);
  if (needsC) body.push(`  float c = f32_from_bits(${hexC});`);
  if (needsExp) body.push(`  int expi = ${expVal|0};`);
  body.push("  // 运算");
  body.push(`  float y = ${expr};`);
  body.push("  // 输出（十进制 | 科学计数 | 位型）");
  body.push(`  print_f32("y", y);`);
  body.push("  return 0;");
  body.push("}");
  return body.join("\n");
}

/* ===== C++ 代码生成（默认路径） ===== */
function buildCPPHeader(){
  return [
    "#include <cstdio>",
    "#include <cstdint>",
    "#include <cmath>",
    "#include <limits>",
    "#include <cfenv>",
    "",
    "#if !defined(__cplusplus) || (__cplusplus < 201703L)",
    "#error \"This generated source requires C++17 (compile with -std=c++17 or higher)\"",
    "#endif",
    "",
    "#ifndef M_PI",
    "static constexpr double M_PI_FALLBACK = 3.14159265358979323846;",
    "#define M_PI M_PI_FALLBACK",
    "#endif",
    "",
    "static float f32_from_bits(uint32_t u){ union { uint32_t u; float f; } v; v.u=u; return v.f; }",
    "static uint32_t bits_from_f32(float f){ union { uint32_t u; float f; } v; v.f=f; return v.u; }",
    "static void print_f32(const char* name, float x){",
    "  uint32_t u = bits_from_f32(x);",
    "  std::printf(\"%s = %.*g | %.*e | 0x%08x\\n\", name, 15, (double)x, 15, (double)x, (unsigned)u);",
    "}",
    "",
    "static inline void print_inputs(float a){",
    "  print_f32(\"a\", a);",
    "}",
    "static inline void print_inputs(float a, float b){",
    "  print_f32(\"a\", a);",
    "  print_f32(\"b\", b);",
    "}",
    "static inline void print_inputs(float a, float b, float c){",
    "  print_f32(\"a\", a);",
    "  print_f32(\"b\", b);",
    "  print_f32(\"c\", c);",
    "}",
    "static inline void print_inputs_ldexp(float a, int expi){",
    "  print_f32(\"a\", a);",
    "  std::printf(\"exp = %d\\n\", expi);",
    "}",
    "",
    "// === f64 utils & printers ===",
    "static double f64_from_bits(uint64_t u){ union { uint64_t u; double f; } v; v.u=u; return v.f; }",
    "static uint64_t bits_from_f64(double f){ union { uint64_t u; double f; } v; v.f=f; return v.u; }",
    "static void print_f64(const char* name, double x){",
    "  uint64_t u = bits_from_f64(x);",
    "  std::printf(\"%s = %.*g | %.*e | 0x%016llx\\n\", name, 17, x, 17, x, (unsigned long long)u);",
    "}",
    "static inline void print_inputs_f64(double a){ print_f64(\"a\", a); }",
    "static inline void print_inputs_f64(double a, double b){ print_f64(\"a\", a); print_f64(\"b\", b); }",
    "static inline void print_inputs_f64(double a, double b, double c){ print_f64(\"a\", a); print_f64(\"b\", b); print_f64(\"c\", c); }",
    "static inline void print_inputs_ldexp_f64(double a, int expi){ print_f64(\"a\", a); std::printf(\"exp = %d\\n\", expi); }",
    "",
    "// === inline helpers for invnorm/erfcinv (float & double) ===",
    "template <typename T> static inline T __moro_invnorm_core(T p){",
    "  // Beasley-Springer/Moro approximation",
    "  const T a0 = (T)2.50662823884;   const T a1 = (T)-18.61500062529;",
    "  const T a2 = (T)41.39119773534; const T a3 = (T)-25.44106049637;",
    "  const T b0 = (T)-8.47351093090; const T b1 = (T)23.08336743743;",
    "  const T b2 = (T)-21.06224101826;const T b3 = (T)3.13082909833;",
    "  const T c0 = (T)0.3374754822726147;    const T c1 = (T)0.9761690190917186;",
    "  const T c2 = (T)0.1607979714918209;    const T c3 = (T)0.0276438810333863;",
    "  const T c4 = (T)0.0038405729373609;    const T c5 = (T)0.0003951896511919;",
    "  const T c6 = (T)0.0000321767881768;    const T c7 = (T)0.0000002888167364;",
    "  const T c8 = (T)0.0000003960315187;",
    "  if (p <= (T)0)  return -std::numeric_limits<T>::infinity();",
    "  if (p >= (T)1)  return  std::numeric_limits<T>::infinity();",
    "  T y = p - (T)0.5;",
    "  if (std::fabs(y) < (T)0.42){",
    "    T r = y * y;",
    "    T num = ((a3*r + a2)*r + a1)*r + a0;",
    "    T den = (((b3*r + b2)*r + b1)*r + b0)*r + (T)1;",
    "    return (num/den) * y;",
    "  } else {",
    "    T r = p < (T)0.5 ? p : (T)1 - p;",
    "    T s = std::log(-std::log(r));",
    "    T t = c0 + s*(c1 + s*(c2 + s*(c3 + s*(c4 + s*(c5 + s*(c6 + s*(c7 + s*c8)))))));",
    "    return (p < (T)0.5) ? -t : t;",
    "  }",
    "}",
    "",
    "static inline float  __invnorm_inline(float  p){ return __moro_invnorm_core<float>(p); }",
    "static inline double __invnorm_inline(double p){ return __moro_invnorm_core<double>(p); }",
    "",
    "template <typename T> static inline T __erfcinv_inline_T(T y){",
    "  // Domain: y in [0,2]",
    "  if (std::isnan(y)) return std::numeric_limits<T>::quiet_NaN();",
    "  if (y <= (T)0) return  std::numeric_limits<T>::infinity();",
    "  if (y >= (T)2) return -std::numeric_limits<T>::infinity();",
    "  if (y == (T)1) return (T)0;",
    "  // initial guess from probit: erfcinv(y) = -invnorm(y/2)/sqrt(2)",
    "  const T SQRT2 = std::sqrt((T)2);",
    "  const T SQRT_PI_INV = (T)0.564189583547756286948; // 1/sqrt(pi)",
    "  T x = -( __invnorm_inline(y*(T)0.5) ) / SQRT2;",
    "  // 3 Newton steps: f(x)=erfc(x)-y; f'(x)=-2/sqrt(pi)*exp(-x^2)",
    "  for (int i=0;i<3;i++){",
    "    T fx = std::erfc(x) - y; ",
    "    T dfx = (T)(-2) * SQRT_PI_INV * std::exp(-x*x);",
    "    x -= fx/dfx;",
    "  }",
    "  return x;",
    "}",
    "",
    "static inline float  __erfcinv_inline(float  y){ return __erfcinv_inline_T<float>(y); }",
    "static inline double __erfcinv_inline(double y){ return __erfcinv_inline_T<double>(y); }",
    ""
  ].join("\n");
}

/* ===== 最小化 C++ 代码生成 ===== */
function buildCPPHeaderMin(options){
  const { needsF64, needsErfcinv, wantsEcho } = options;
  const hdr = [];
  
  // 基础头文件
  hdr.push("#include <cmath>");
  hdr.push("#include <limits>");
  hdr.push("#include <cfenv>");
  
  if (wantsEcho) {
    hdr.push("#include <cstdio>");
    hdr.push("#include <cstdint>");
  }
  
  hdr.push("");
  hdr.push("#if !defined(__cplusplus) || (__cplusplus < 201703L)");
  hdr.push("#error \"This generated source requires C++17 (compile with -std=c++17 or higher)\"");
  hdr.push("#endif");
  
  hdr.push("");
  hdr.push("#ifndef M_PI");
  hdr.push("static constexpr double M_PI_FALLBACK = 3.14159265358979323846;");
  hdr.push("#define M_PI M_PI_FALLBACK");
  hdr.push("#endif");
  
  // f32 工具（始终包含）
  hdr.push("static float f32_from_bits(uint32_t u){ union { uint32_t u; float f; } v; v.u=u; return v.f; }");
  hdr.push("static uint32_t bits_from_f32(float f){ union { uint32_t u; float f; } v; v.f=f; return v.u; }");
  hdr.push("static void print_f32(const char* name, float x){");
  hdr.push("  uint32_t u = bits_from_f32(x);");
  hdr.push("  std::printf(\"%s = %.*g | %.*e | 0x%08x\\n\", name, 15, (double)x, 15, (double)x, (unsigned)u);");
  hdr.push("}");
  
  if (wantsEcho) {
    hdr.push("");
    hdr.push("static inline void print_inputs(float a){");
    hdr.push("  print_f32(\"a\", a);");
    hdr.push("}");
    hdr.push("static inline void print_inputs(float a, float b){");
    hdr.push("  print_f32(\"a\", a);");
    hdr.push("  print_f32(\"b\", b);");
    hdr.push("}");
    hdr.push("static inline void print_inputs(float a, float b, float c){");
    hdr.push("  print_f32(\"a\", a);");
    hdr.push("  print_f32(\"b\", b);");
    hdr.push("  print_f32(\"c\", c);");
    hdr.push("}");
    hdr.push("static inline void print_inputs_ldexp(float a, int expi){");
    hdr.push("  print_f32(\"a\", a);");
    hdr.push("  std::printf(\"exp = %d\\n\", expi);");
    hdr.push("}");
  }
  
  if (needsF64 && wantsEcho) {
    hdr.push("");
    hdr.push("// === f64 utils & printers ===");
    hdr.push("static double f64_from_bits(uint64_t u){ union { uint64_t u; double f; } v; v.u=u; return v.f; }");
    hdr.push("static uint64_t bits_from_f64(double f){ union { uint64_t u; double f; } v; v.f=f; return v.u; }");
    hdr.push("static void print_f64(const char* name, double x){");
    hdr.push("  uint64_t u = bits_from_f64(x);");
    hdr.push("  std::printf(\"%s = %.*g | %.*e | 0x%016llx\\n\", name, 17, x, 17, x, (unsigned long long)u);");
    hdr.push("}");
    hdr.push("static inline void print_inputs_f64(double a){ print_f64(\"a\", a); }");
    hdr.push("static inline void print_inputs_f64(double a, double b){ print_f64(\"a\", a); print_f64(\"b\", b); }");
    hdr.push("static inline void print_inputs_f64(double a, double b, double c){ print_f64(\"a\", a); print_f64(\"b\", b); print_f64(\"c\", c); }");
    hdr.push("static inline void print_inputs_ldexp_f64(double a, int expi){ print_f64(\"a\", a); std::printf(\"exp = %d\\n\", expi); }");
  }
  
  if (needsErfcinv) {
    hdr.push("");
    hdr.push("// === inline helpers for invnorm/erfcinv ===");
    hdr.push("template <typename T> static inline T __moro_invnorm_core(T p){");
    hdr.push("  const T a0 = (T)2.50662823884;   const T a1 = (T)-18.61500062529;");
    hdr.push("  const T a2 = (T)41.39119773534; const T a3 = (T)-25.44106049637;");
    hdr.push("  const T b0 = (T)-8.47351093090; const T b1 = (T)23.08336743743;");
    hdr.push("  const T b2 = (T)-21.06224101826;const T b3 = (T)3.13082909833;");
    hdr.push("  const T c0 = (T)0.3374754822726147;    const T c1 = (T)0.9761690190917186;");
    hdr.push("  const T c2 = (T)0.1607979714918209;    const T c3 = (T)0.0276438810333863;");
    hdr.push("  const T c4 = (T)0.0038405729373609;    const T c5 = (T)0.0003951896511919;");
    hdr.push("  const T c6 = (T)0.0000321767881768;    const T c7 = (T)0.0000002888167364;");
    hdr.push("  const T c8 = (T)0.0000003960315187;");
    hdr.push("  if (p <= (T)0)  return -std::numeric_limits<T>::infinity();");
    hdr.push("  if (p >= (T)1)  return  std::numeric_limits<T>::infinity();");
    hdr.push("  T y = p - (T)0.5;");
    hdr.push("  if (std::fabs(y) < (T)0.42){");
    hdr.push("    T r = y * y;");
    hdr.push("    T num = ((a3*r + a2)*r + a1)*r + a0;");
    hdr.push("    T den = (((b3*r + b2)*r + b1)*r + b0)*r + (T)1;");
    hdr.push("    return (num/den) * y;");
    hdr.push("  } else {");
    hdr.push("    T r = p < (T)0.5 ? p : (T)1 - p;");
    hdr.push("    T s = std::log(-std::log(r));");
    hdr.push("    T t = c0 + s*(c1 + s*(c2 + s*(c3 + s*(c4 + s*(c5 + s*(c6 + s*(c7 + s*c8)))))));");
    hdr.push("    return (p < (T)0.5) ? -t : t;");
    hdr.push("  }");
    hdr.push("}");
    hdr.push("");
    hdr.push("static inline float  __invnorm_inline(float  p){ return __moro_invnorm_core<float>(p); }");
    hdr.push("static inline double __invnorm_inline(double p){ return __moro_invnorm_core<double>(p); }");
    hdr.push("");
    hdr.push("template <typename T> static inline T __erfcinv_inline_T(T y){");
    hdr.push("  if (std::isnan(y)) return std::numeric_limits<T>::quiet_NaN();");
    hdr.push("  if (y <= (T)0) return  std::numeric_limits<T>::infinity();");
    hdr.push("  if (y >= (T)2) return -std::numeric_limits<T>::infinity();");
    hdr.push("  if (y == (T)1) return (T)0;");
    hdr.push("  const T SQRT2 = std::sqrt((T)2);");
    hdr.push("  const T SQRT_PI_INV = (T)0.564189583547756286948;");
    hdr.push("  T x = -( __invnorm_inline(y*(T)0.5) ) / SQRT2;");
    hdr.push("  for (int i=0;i<3;i++){");
    hdr.push("    T fx = std::erfc(x) - y; ");
    hdr.push("    T dfx = (T)(-2) * SQRT_PI_INV * std::exp(-x*x);");
    hdr.push("    x -= fx/dfx;");
    hdr.push("  }");
    hdr.push("  return x;");
    hdr.push("}");
    hdr.push("");
    hdr.push("static inline float  __erfcinv_inline(float  y){ return __erfcinv_inline_T<float>(y); }");
    hdr.push("static inline double __erfcinv_inline(double y){ return __erfcinv_inline_T<double>(y); }");
  }
  
  return hdr.join("\n");
}

function buildCPPStandardMin(opts){
  const { header, expr, fnKey, hexA, hexB, hexC, needsB, needsC, needsExp, expVal, isF64, wantsEcho } = opts;
  const body = [];
  body.push(header);

  body.push("int main(){");

  let mode = "RN";
  try { if (typeof getRoundingMode==="function") mode = getRoundingMode(); } catch {}
  const map = { RN: "FE_TONEAREST", RZ: "FE_TOWARDZERO", RU: "FE_UPWARD", RD: "FE_DOWNWARD" };
  const fe = map[mode] || "FE_TONEAREST";
  body.push(`  std::fesetround(${fe});`);

  if (isF64) {
    body.push(`  double a = f64_from_bits(${hexA});`);
    if (needsB) body.push(`  double b = f64_from_bits(${hexB});`);
    if (needsC) body.push(`  double c = f64_from_bits(${hexC});`);
    if (needsExp) body.push(`  int expi = ${expVal|0};`);

    if (wantsEcho) {
      body.push("  // 输入回显");
      if (needsExp && !needsB && !needsC) body.push("  print_inputs_ldexp_f64(a, expi);");
      else if (needsC) body.push("  print_inputs_f64(a, b, c);");
      else if (needsB) body.push("  print_inputs_f64(a, b);");
      else body.push("  print_inputs_f64(a);");
    }

    const expr64 = expr
      .replace(/\(float\)/g, "")
      .replace(/([0-9]+\.[0-9]*)f\b/g, "$1")
      .replace(/([0-9])f\b/g, "$1")
      .replace(/std::pow\(10\.0f\s*,\s*a\)/g, "std::pow(10.0, a)")
      .replace(/\(float\)\s*std::/g, "std::/");
    body.push("  // 运算");
    body.push(`  double y = (double)(${expr64});`);
    if (wantsEcho) {
      body.push("  // 输出");
      body.push(`  print_f64("y", y);`);
    }
  } else {
    body.push(`  float a = f32_from_bits(${hexA});`);
    if (needsB) body.push(`  float b = f32_from_bits(${hexB});`);
    if (needsC) body.push(`  float c = f32_from_bits(${hexC});`);
    if (needsExp) body.push(`  int expi = ${expVal|0};`);

    if (wantsEcho) {
      body.push("  // 输入回显");
      if (needsExp && !needsB && !needsC) body.push("  print_inputs_ldexp(a, expi);");
      else if (needsC) body.push("  print_inputs(a, b, c);");
      else if (needsB) body.push("  print_inputs(a, b);");
      else body.push("  print_inputs(a);");
    }

    body.push("  // 运算");
    body.push(`  float y = (float)(${expr});`);
    if (wantsEcho) {
      body.push("  // 输出");
      body.push(`  print_f32("y", y);`);
    }
  }

  body.push("  return 0;");
  body.push("}");
  return body.join("\n");
}

function buildCPPStandard(opts){
  const {expr, fnKey, hexA, hexB, hexC, needsB, needsC, needsExp, expVal, isF64} = opts;
  const body = [];
  body.push(buildCPPHeader());

  body.push("int main(){");

  let mode = "RN";
  try { if (typeof getRoundingMode==="function") mode = getRoundingMode(); } catch {}
  const map = { RN: "FE_TONEAREST", RZ: "FE_TOWARDZERO", RU: "FE_UPWARD", RD: "FE_DOWNWARD" };
  const fe = map[mode] || "FE_TONEAREST";
  body.push(`  std::fesetround(${fe});`);

  if (isF64) {
    body.push(`  double a = f64_from_bits(${hexA});`);
    if (needsB) body.push(`  double b = f64_from_bits(${hexB});`);
    if (needsC) body.push(`  double c = f64_from_bits(${hexC});`);
    if (needsExp) body.push(`  int expi = ${expVal|0};`);

    body.push("  // 输入回显");
    if (needsExp && !needsB && !needsC) body.push("  print_inputs_ldexp_f64(a, expi);");
    else if (needsC) body.push("  print_inputs_f64(a, b, c);");
    else if (needsB) body.push("  print_inputs_f64(a, b);");
    else body.push("  print_inputs_f64(a);");

    // 清理表达式中可能出现的 float 后缀/强转，避免落入 float 重载
    const expr64 = expr
      .replace(/\(float\)/g, "")
      .replace(/([0-9]+\.[0-9]*)f\b/g, "$1")
      .replace(/([0-9])f\b/g, "$1")
      .replace(/std::pow\(10\.0f\s*,\s*a\)/g, "std::pow(10.0, a)")
      .replace(/\(float\)\s*std::/g, "std::/");
    body.push("  // 运算");
    body.push(`  double y = (double)(${expr64});`);
    body.push("  // 输出");
    body.push(`  print_f64("y", y);`);
  } else {
    body.push(`  float a = f32_from_bits(${hexA});`);
    if (needsB) body.push(`  float b = f32_from_bits(${hexB});`);
    if (needsC) body.push(`  float c = f32_from_bits(${hexC});`);
    if (needsExp) body.push(`  int expi = ${expVal|0};`);

    body.push("  // 输入回显");
    if (needsExp && !needsB && !needsC) body.push("  print_inputs_ldexp(a, expi);");
    else if (needsC) body.push("  print_inputs(a, b, c);");
    else if (needsB) body.push("  print_inputs(a, b);");
    else body.push("  print_inputs(a);");

    body.push("  // 运算");
    body.push(`  float y = (float)(${expr});`);
    body.push("  // 输出");
    body.push(`  print_f32("y", y);`);
  }

  body.push("  return 0;");
  body.push("}");
  return body.join("\n");
}
function buildCPPForModf(hexA, isF64){
  const hdr = buildCPPHeader();
  if (isF64){
    return [
      hdr,
      "int main(){",
      `  double a = f64_from_bits(${hexA});`,
      "  // 输入回显",
      "  print_inputs_f64(a);",
      "  double ip=0.0;",
      "  double frac = std::modf(a, &ip);",
      "  print_f64(\"frac\", frac);",
      "  print_f64(\"int\", ip);",
      "  return 0;",
      "}"
    ].join("\n");
  }
  return [
    hdr,
    "int main(){",
    `  float a = f32_from_bits(${hexA});`,
    "  // 输入回显",
    "  print_inputs(a);",
    "  float ip=0.0f;",
    "  float frac = std::modf(a, &ip);",
    "  print_f32(\"frac\", frac);",
    "  print_f32(\"int\", ip);",
    "  return 0;",
    "}"
  ].join("\n");
}
function buildCPPForFrexp(hexA, isF64){
  const hdr = buildCPPHeader();
  if (isF64){
    return [
      hdr,
      "int main(){",
      `  double a = f64_from_bits(${hexA});`,
      "  // 输入回显",
      "  print_inputs_f64(a);",
      "  int expi=0;",
      "  double mant = std::frexp(a, &expi);",
      "  print_f64(\"mant\", mant);",
      "  std::printf(\"exp = %d\\n\", expi);",
      "  return 0;",
      "}"
    ].join("\n");
  }
  return [
    hdr,
    "int main(){",
    `  float a = f32_from_bits(${hexA});`,
    "  // 输入回显",
    "  print_inputs(a);",
    "  int expi=0;",
    "  float mant = std::frexp(a, &expi);",
    "  print_f32(\"mant\", mant);",
    "  std::printf(\"exp = %d\\n\", expi);",
    "  return 0;",
    "}"
  ].join("\n");
}
function buildCPPForSincos(hexA, isF64){
  const hdr = buildCPPHeader();
  if (isF64){
    return [
      hdr,
      "int main(){",
      `  double a = f64_from_bits(${hexA});`,
      "  print_inputs_f64(a);",
      "  double s = std::sin(a);",
      "  double c = std::cos(a);",
      "  print_f64(\"sin\", s);",
      "  print_f64(\"cos\", c);",
      "  return 0;",
      "}"
    ].join("\n");
  }
  return [
    hdr,
    "int main(){",
    `  float a = f32_from_bits(${hexA});`,
    "  print_inputs(a);",
    "  float s = std::sin(a);",
    "  float c = std::cos(a);",
    "  print_f32(\"sin\", s);",
    "  print_f32(\"cos\", c);",
    "  return 0;",
    "}"
  ].join("\n");
}
function buildCForModf(hexA){
  const hdr = buildCHeader();
  return [
    hdr,
    "int main(){",
    `  float a = f32_from_bits(${hexA});`,
    "  float ip=0.0f;",
    "  float frac = modff(a, &ip);",
    "  print_f32(\"frac\", frac);",
    "  print_f32(\"int\", ip);",
    "  return 0;",
    "}"
  ].join("\n");
}
function buildCForFrexp(hexA){
  const hdr = buildCHeader();
  return [
    hdr,
    "int main(){",
    `  float a = f32_from_bits(${hexA});`,
    "  int expi=0;",
    "  float mant = frexpf(a, &expi);",
    "  print_f32(\"mant\", mant);",
    "  printf(\"exp = %d\\n\", expi);",
    "  return 0;",
    "}"
  ].join("\n");
}
function buildCForSincos(hexA){
  const hdr = buildCHeader();
  return [
    hdr,
    "int main(){",
    `  float a = f32_from_bits(${hexA});`,
    "  float s = sinf(a);",
    "  float c = cosf(a);",
    "  print_f32(\"sin\", s);",
    "  print_f32(\"cos\", c);",
    "  return 0;",
    "}"
  ].join("\n");
}

function decStr(x) {
  if (!Number.isFinite(x)) return String(x);
  // 按当前类型选择显示精度：f32≈7位有效数字，f64≈15-17位有效数字
  const t = (typeof getNumericType === "function") ? getNumericType() : "f32";
  const y = +x;
  if (y === 0) return "0";
  const ay = Math.abs(y);
  // 大/小幅值使用科学计数法（交由 sciStr 控制宽度）
  if (ay >= 1e12 || (ay < 1e-9)) {
    return sciStr(y);
  }
  // 在普通范围使用 toPrecision，并去除末尾多余 0 与可能的末尾小数点
  const prec = (t === "f64") ? 17 : 9; // f64 提升到 17，有效展示更多精度；f32 稍微放宽到 9
  return y.toPrecision(prec).replace(/\.?0+$/, "");
}

// 数学常量
const PI = f32(Math.PI);
const LN2 = f32(Math.LN2);
const LN10 = f32(Math.LN10);
// 64 位常量
const PI64 = f64(Math.PI);
const LN2_64 = f64(Math.LN2);
const LN10_64 = f64(Math.LN10);

// Float32 位级辅助：提取符号/指数/尾数、构造值
function u32Of(x){ __f32bufF[0]=x; return __f32bufU[0]>>>0; }
function f32OfBits(u){ __f32bufU[0]=u>>>0; return __f32bufF[0]; }
function signbit32(x){ return (u32Of(f32(x))>>>31)&1; }
function abs32(x){ return f32OfBits(u32Of(f32(x)) & 0x7fffffff); }
function copysign32(x, y){
  const ux = u32Of(f32(x)) & 0x7fffffff;
  const sy = (u32Of(f32(y)) & 0x80000000) >>> 0;
  return f32OfBits((ux | sy)>>>0);
}
function nextafter32(x, y){
  let ux = u32Of(f32(x));
  const uy = u32Of(f32(y));
  if (Number.isNaN(x) || Number.isNaN(y)) return f32(NaN);
  if (ux === uy) return f32(y);
  if (x === 0){
    // 最小幅度朝向 y
    return (y > 0 || (y===0 && (uy>>>31)===0)) ? f32OfBits(0x00000001) : f32OfBits(0x80000001);
  }
  const sx = ux>>>31;
  if ((y > x) || (y===x && (uy>>>31) < sx)) {
    ux = (ux + 1)>>>0;
  } else {
    ux = (ux - 1)>>>0;
  }
  return f32OfBits(ux);
}
// Float64 位级工具
function u64Of(x){ __f64bufF[0]=x; return __f64bufU[0]; } // BigInt
function f64OfBits(u){ __f64bufU[0]=BigInt.asUintN(64, BigInt(u)); return __f64bufF[0]; }
function signbit64(x){ return Number((u64Of(f64(x)) >> 63n) & 1n); }
// 调试开关：FP64 位级路径（默认打开）
let __debugFP64 = true;
function setDebugFP64(on){ __debugFP64 = !!on; }
function __hex64(q){
  let s = (BigInt(q) & 0xffffffffffffffffn).toString(16);
  if (s.length < 16) s = "0".repeat(16 - s.length) + s;
  return "0x" + s;
}
function abs64(x){
  const u = u64Of(f64(x));
  const v = u & 0x7fffffffffffffffn; // 仅清除符号位 bit63
  return f64OfBits(v);
}
function copysign64(x,y){
  const ux_all = u64Of(f64(x));
  const ux = ux_all & 0x7fffffffffffffffn;
  const sy = u64Of(f64(y)) & 0x8000000000000000n;
  const v = (ux | sy);
  if (__debugFP64){
    console.log("[copysign64] x=", __hex64(ux_all), "y=", __hex64(u64Of(f64(y))), "out=", __hex64(v));
  }
  return f64OfBits(v);
}
function nextafter64(x, y){
  x = f64(x); y = f64(y);
  if (Number.isNaN(x) || Number.isNaN(y)) return f64(NaN);
  const ux = u64Of(x);
  const uy = u64Of(y);
  if (ux === uy) return f64(y);
  if (x === 0){
    // 64 位最小 subnormal
    return (y > 0 || (y===0 && ((uy>>63n)&1n)===0n)) ? f64OfBits(0x0000000000000001n) : f64OfBits(0x8000000000000001n);
  }
  const sx = Number((ux>>63n)&1n);
  let u = ux;
  const towardUp = (y > x) || (y===x && Number((uy>>63n)&1n) < sx);
  if (towardUp){
    u = (u + 1n) & 0xffffffffffffffffn;
  } else {
    u = (u - 1n) & 0xffffffffffffffffn;
  }
  return f64OfBits(u);
}
// 暴露调试开关到全局，便于控制台调用
try { window.setDebugFP64 = setDebugFP64; } catch {}

// ===== 舍入模式支持（基础算子专用） =====
const RMode = { RN:"RN", RZ:"RZ", RU:"RU", RD:"RD" }; // 最近偶数、向零、向上、向下
let __ROUNDING_MODE__ = RMode.RN;
let __NUMERIC_TYPE__ = "f32"; // "f32" | "f64"
function setRoundingMode(mode){
  if (!mode || !(mode in RMode)) return;
  __ROUNDING_MODE__ = mode;
  try { localStorage.setItem("rounding.mode", mode); } catch {}
}
function getRoundingMode(){ return __ROUNDING_MODE__; }
function setNumericType(t){
  const v = (t === "f64") ? "f64" : "f32";
  __NUMERIC_TYPE__ = v;
  try { localStorage.setItem("numeric.type", v); } catch {}
}
function getNumericType(){
  try{
    const v = localStorage.getItem("numeric.type");
    if (v === "f64" || v === "f32") { __NUMERIC_TYPE__ = v; }
  }catch{}
  return __NUMERIC_TYPE__;
}
// 依据 double 值与 RN 落位值决定下一步
function roundF32ByMode(d, mode){
  // NaN 直通
  if (Number.isNaN(d)) return f32(NaN);

  // 先得到 RN 落位
  __f32bufF[0] = d;
  const yRN = __f32bufF[0];

  // 若 yRN 为 ±Inf，说明发生了 float32 溢出，按模式分派
  if (!Number.isFinite(yRN)) {
    const signPos = d > 0 || (d === 0 && 1/Number(d) === Infinity); // 正方向
    const MAX_POS = f32OfBits(0x7f7fffff);
    const MAX_NEG = f32OfBits(0xff7fffff);
    switch (mode) {
      case RMode.RN:
        return signPos ? f32(Infinity) : f32(-Infinity);
      case RMode.RZ:
        return signPos ? MAX_POS : MAX_NEG;
      case RMode.RU:
        // 向 +∞：正溢出 -> +Inf；负溢出 -> 取更靠 +∞ 的最大负有限值
        return signPos ? f32(Infinity) : MAX_NEG;
      case RMode.RD:
        // 向 −∞：正溢出 -> 取最大正有限值；负溢出 -> −Inf
        return signPos ? MAX_POS : f32(-Infinity);
      default:
        return yRN;
    }
  }

  if (mode === RMode.RN) return yRN;

  // 若 double 恰为某个 f32，所有模式一致
  if (Number(yRN) === Number(d)) return yRN;

  // 计算 RN 邻居
  const towardPosInf = () => nextafter32(yRN, f32(Infinity));
  const towardNegInf = () => nextafter32(yRN, f32(-Infinity));

  // 判断 d 与 yRN 的大小关系（决定“上邻”或“下邻”）
  const yRNtoD_isUp = d > Number(yRN); // d 位于 yRN 的正方向
  const up = yRNtoD_isUp ? towardPosInf() : towardNegInf();
  const down = yRNtoD_isUp ? towardNegInf() : towardPosInf();

  // RU: 向 +∞
  if (mode === RMode.RU) return up;
  // RD: 向 −∞
  if (mode === RMode.RD) return down;

  // RZ: 向零（基于 yRN 的符号）
  const ySign = Math.sign(yRN) || 0; // +1, -1, or 0
  if (ySign > 0) {
    // 正数向零 => 选择更小的邻居
    return down;
  } else if (ySign < 0) {
    // 负数向零 => 选择更大的邻居
    return up;
  } else {
    // yRN 为 0，向零即 0
    return f32(0);
  }
}
function ilogb32(x){
  const xx = f32(x);
  if (Number.isNaN(xx)) return 0x7fffffff; // FP_ILOGB_NAN
  if (xx === 0) return -0x7fffffff;       // FP_ILOGB0
  if (!Number.isFinite(xx)) return 0x7fffffff; // FP_ILOGB_INF
  const u = u32Of(xx);
  const e = (u>>>23) & 0xff;
  if (e === 0){ // subnormal
    // 规格化尾数
    let mant = (u & 0x7fffff)>>>0;
    let k = -126;
    while ((mant & 0x800000) === 0){ mant <<= 1; k--; if (mant===0) break; }
    return k;
  }
  return (e - 127)|0;
}
/* removed duplicate erroneous insertion of roundF64ByMode */
function roundF64ByMode(d, mode){
  // NaN pass-through
  if (Number.isNaN(d)) return f64(NaN);

  __f64bufF[0]=d;
  const yRN = __f64bufF[0];

  if (!Number.isFinite(yRN)) {
    const signPos = d > 0 || (d === 0 && 1/Number(d) === Infinity);
    const MAX_POS = f64OfBits(0x7fefffffffffffffn);
    const MAX_NEG = f64OfBits(0xffefffffffffffffn);
    switch(mode){
      case RMode.RN: return signPos ? f64(Infinity) : f64(-Infinity);
      case RMode.RZ: return signPos ? MAX_POS : MAX_NEG;
      case RMode.RU: return signPos ? f64(Infinity) : MAX_NEG;
      case RMode.RD: return signPos ? MAX_POS : f64(-Infinity);
      default: return yRN;
    }
  }

  if (mode === RMode.RN) return yRN;
  if (Number(yRN) === Number(d)) return yRN;

  const towardPosInf = () => nextafter64(yRN, f64(Infinity));
  const towardNegInf = () => nextafter64(yRN, f64(-Infinity));
  const yRNtoD_isUp = d > Number(yRN);
  const up = yRNtoD_isUp ? towardPosInf() : towardNegInf();
  const down = yRNtoD_isUp ? towardNegInf() : towardPosInf();

  if (mode === RMode.RU) return up;
  if (mode === RMode.RD) return down;

  const ySign = Math.sign(yRN) || 0;
  if (ySign > 0) return down;
  if (ySign < 0) return up;
  return f64(0);
}
function logb32(x){
  const i = ilogb32(x);
  if (i === 0x7fffffff) return f32(Infinity);   // NaN/Inf -> +Inf
  if (i === -0x7fffffff) return f32(-Infinity); // 0 -> -Inf
  return f32(i);
}
function scalbn32(x, n){
  // x * 2^n 的 float32 实现，使用 nextafter32 方案不可靠，直接通过 Math.pow 后落位
  __f32bufF[0] = f32(x) * Math.pow(2, n|0);
  return __f32bufF[0];
}

// 十进制与十六进制输入双通道联动：当任一变更时，解析为 Float32 并同步另一侧显示
function parseF64Input(str){
  if (typeof str !== "string") return NaN;
  const v = str.trim();
  if (v === "") return NaN;
  const m = /^(?:0x)?([0-9a-fA-F]{1,16})$/.exec(v);
  if (m){
    const hex = m[1].padStart(16,"0");
    // 以 BigInt 解析 64 位位型
    const u = BigInt("0x"+hex);
    return f64OfBits(u);
  }
  const n = Number(v);
  return Number.isNaN(n) ? NaN : f64(n);
}

// 根据当前 numeric type 绑定（支持 f32/f64）
function bindDualInput(decId, hexId) {
  const decEl = document.getElementById(decId);
  const hexEl = document.getElementById(hexId);
  if (!decEl || !hexEl) return;

  let lock = false;

  function toHexByType(x){
    const t = getNumericType();
    return t==="f64" ? bitsF64(x) : bitsF32(x);
  }
  function toDecByType(x){
    return decStr(x);
  }
  function castByTypeFromNumber(n){
    const t = getNumericType();
    return t==="f64" ? f64(n) : f32(n);
  }
  function parseHexByType(v){
    const t = getNumericType();
    return t==="f64" ? parseF64Input(v) : parseF32Input(v);
  }

  function fromDec() {
    if (lock) return;
    const v = decEl.value.trim();
    if (v === "") { lock=true; hexEl.value = ""; lock=false; return; }
    if (/^(nan)$/i.test(v)) { lock=true; hexEl.value=""; lock=false; return; }
    if (/^[+-]?inf(inity)?$/i.test(v)) { lock=true; hexEl.value=""; lock=false; return; }
    const n = Number(v);
    if (!Number.isFinite(n)) { lock=true; hexEl.value = ""; lock=false; return; }
    const x = castByTypeFromNumber(n);
    lock = true;
    hexEl.value = toHexByType(x);
    lock = false;
  }
  function fromHex() {
    if (lock) return;
    const v = hexEl.value.trim();
    if (v === "") { lock=true; decEl.value = ""; lock=false; return; }
    const parsed = parseHexByType(v);
    if (!Number.isFinite(parsed)) {
      lock = true;
      if (Number.isNaN(parsed)) decEl.value = "NaN";
      else decEl.value = String(parsed);
      lock = false;
      return;
    }
    lock = true;
    decEl.value = toDecByType(parsed);
    lock = false;
  }

  // 先移除旧监听，避免重复绑定
  decEl.oninput = null; hexEl.oninput = null;
  decEl.addEventListener("input", fromDec);
  hexEl.addEventListener("input", fromHex);
}



// 通用校验与提示
function setHint(msg, cls = "warn") {
  const el = document.getElementById("hints");
  el.textContent = msg || "";
  el.className = `hints ${cls}`;
}
function setStatus(msg, cls = "") {
  const el = document.getElementById("out-status");
  el.textContent = msg || "";
  el.className = `mono ${cls}`;
}
function setOutputs(y) {
  // 确保输出区域存在（自动创建 out-dec/out-sci/out-hex/out-status 行）
  (function ensureOutputFields(){
    const main = document.querySelector("main") || document.body;
    let result = document.querySelector(".result");
    if (!result) { result = document.createElement("div"); result.className = "result"; main.appendChild(result); }
    function ensureLine(label, spanId){
      let span = document.getElementById(spanId);
      if (!span) {
        const row = document.createElement("div");
        row.className = "mono";
        const strong = document.createElement("strong");
        strong.textContent = label + " ";
        span = document.createElement("span");
        span.id = spanId;
        row.appendChild(strong);
        row.appendChild(span);
        result.appendChild(row);
      }
      return document.getElementById(spanId);
    }
    ensureLine("out-dec:", "out-dec");
    ensureLine("out-sci:", "out-sci");
    ensureLine("out-hex:", "out-hex");
    if (!document.getElementById("out-status")) {
      const st = document.createElement("div");
      st.id = "out-status";
      st.className = "mono";
      result.appendChild(st);
    }
  })();

  const t = getNumericType();
  if (t === "f64") {
    __f64bufF[0] = f64(y);
    const yy = __f64bufF[0];
    const hx = bitsF64(yy);
    document.getElementById("out-dec").textContent = decStr(yy);
    document.getElementById("out-sci").textContent = sciStr(yy);
    document.getElementById("out-hex").textContent = hx;
    // 可见调试文本，便于用户直接查看
    const statusEl = document.getElementById("out-status");
    if (statusEl) {
      // 隐藏调试噪声，仅在需要时手动开启
      // statusEl.textContent = `[setOutputs.f64] ${hx}` + (prev ? " | " + prev : "");
      statusEl.textContent = "";
    }
  } else {
    __f32bufF[0] = f32(y);
    const y32 = __f32bufF[0];
    document.getElementById("out-dec").textContent = decStr(y32);
    document.getElementById("out-sci").textContent = sciStr(y32);
    document.getElementById("out-hex").textContent = bitsF32(y32);
  }
}

// 基础函数实现（均以 Float32 收敛）
const Ops = {
  // 二元基础（位级 Float32 运算，确保 subnormal 保留），并按所选舍入模式对结果单步落位
  add: (a,b) => {
    const type = getNumericType(); // "f32" | "f64"
    if (type === "f64") {
      const ax = Number(f64(a)), bx = Number(f64(b));
      const d = ax + bx;
      return roundF64ByMode(d, getRoundingMode());
    } else {
      const ax = Number(f32(a)), bx = Number(f32(b));
      const d = ax + bx;
      return roundF32ByMode(d, getRoundingMode());
    }
  },
  sub: (a,b) => {
    const type = getNumericType();
    if (type === "f64") {
      const ax = Number(f64(a)), bx = Number(f64(b));
      const d = ax - bx;
      return roundF64ByMode(d, getRoundingMode());
    } else {
      const ax = Number(f32(a)), bx = Number(f32(b));
      const d = ax - bx;
      return roundF32ByMode(d, getRoundingMode());
    }
  },
  mul: (a,b) => {
    const type = getNumericType();
    if (type === "f64") {
      const ax = Number(f64(a)), bx = Number(f64(b));
      const d = ax * bx;
      return roundF64ByMode(d, getRoundingMode());
    } else {
      const ax = Number(f32(a)), bx = Number(f32(b));
      const d = ax * bx;
      return roundF32ByMode(d, getRoundingMode());
    }
  },
  div: (a,b) => {
    const type = getNumericType();
    if (type === "f64") {
      const ax = Number(f64(a)), bx = Number(f64(b));
      const d = ax / bx;
      return roundF64ByMode(d, getRoundingMode());
    } else {
      const ax = Number(f32(a)), bx = Number(f32(b));
      const d = ax / bx;
      return roundF32ByMode(d, getRoundingMode());
    }
  },
  // fma：double 中计算 a*b+c，然后按模式落位
  fma: (a,b,c) => {
    const type = getNumericType();
    if (type === "f64") {
      const ax = Number(f64(a));
      const bx = Number(f64(b));
      const cx = Number(f64(c));
      const d = ax * bx + cx;
      return roundF64ByMode(d, getRoundingMode());
    } else {
      const ax = Number(f32(a));
      const bx = Number(f32(b));
      const cx = Number(f32(c));
      const d = ax * bx + cx;
      return roundF32ByMode(d, getRoundingMode());
    }
  },
  // 一元
  sqrt: (a) => {
    const t = getNumericType();
    if (t === "f64") {
      __f64bufF[0] = f64(a);
      __f64bufF[0] = Math.sqrt(__f64bufF[0]);
      return __f64bufF[0];
    } else {
      __f32bufF[0] = f32(a);
      __f32bufF[0] = Math.sqrt(__f32bufF[0]);
      return __f32bufF[0];
    }
  },
  rsqrt: (a) => {
    const t = getNumericType();
    if (t === "f64") {
      __f64bufF[0] = f64(a);
      __f64bufF[0] = 1/Math.sqrt(__f64bufF[0]);
      return __f64bufF[0];
    } else {
      __f32bufF[0] = f32(a);
      __f32bufF[0] = 1/Math.sqrt(__f32bufF[0]);
      return __f32bufF[0];
    }
  },
  // 幂与指数对数族
  pow: (a,b) => {
    const t = getNumericType();
    if (t === "f64") { __f64bufF[0] = Math.pow(f64(a), f64(b)); return __f64bufF[0]; }
    __f32bufF[0] = Math.pow(f32(a), f32(b));
    return __f32bufF[0];
  },
  exp: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.exp(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.exp(f32(a)); return __f32bufF[0]; },
  expm1: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.expm1(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.expm1(f32(a)); return __f32bufF[0]; },
  exp10: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.exp(f64(a)*LN10_64); return __f64bufF[0]; } __f32bufF[0] = Math.exp(fmul(f32(a), LN10)); return __f32bufF[0]; },
  log: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.log(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.log(f32(a)); return __f32bufF[0]; },
  log2: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.log2(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.log2(f32(a)); return __f32bufF[0]; },
  log1p: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.log1p(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.log1p(f32(a)); return __f32bufF[0]; },
  // 三角与双曲
  sin: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.sin(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.sin(f32(a)); return __f32bufF[0]; },
  cos: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.cos(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.cos(f32(a)); return __f32bufF[0]; },
  tan: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.tan(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.tan(f32(a)); return __f32bufF[0]; },

  // π 缩放三角：sinpi/cospi（以 Float32 单次写回）
  sinpi: (a) => {
    const t=getNumericType();
    if (t==="f64"){ const x=f64(a); __f64bufF[0]=Math.sin(f64(Math.PI * x)); return __f64bufF[0]; }
    const x = f32(a); __f32bufF[0] = Math.sin(f32(Math.PI * x)); return __f32bufF[0];
  },
  cospi: (a) => {
    const t=getNumericType();
    if (t==="f64"){ const x=f64(a); __f64bufF[0]=Math.cos(f64(Math.PI * x)); return __f64bufF[0]; }
    const x = f32(a); __f32bufF[0] = Math.cos(f32(Math.PI * x)); return __f32bufF[0];
  },

  // 反三角
  asin: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.asin(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.asin(f32(a)); return __f32bufF[0]; },
  acos: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.acos(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.acos(f32(a)); return __f32bufF[0]; },
  atan: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.atan(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.atan(f32(a)); return __f32bufF[0]; },
  atan2: (a, b) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.atan2(f64(a), f64(b)); return __f64bufF[0]; } __f32bufF[0] = Math.atan2(f32(a), f32(b)); return __f32bufF[0]; },

  // 反双曲
  asinh: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.asinh(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.asinh(f32(a)); return __f32bufF[0]; },
  acosh: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.acosh(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.acosh(f32(a)); return __f32bufF[0]; },
  atanh: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.atanh(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.atanh(f32(a)); return __f32bufF[0]; },

  // 双曲
  sinh: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.sinh(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.sinh(f32(a)); return __f32bufF[0]; },
  cosh: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.cosh(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.cosh(f32(a)); return __f32bufF[0]; },
  tanh: (a) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]=Math.tanh(f64(a)); return __f64bufF[0]; } __f32bufF[0] = Math.tanh(f32(a)); return __f32bufF[0]; },

  // sincos: 返回对象 {sin, cos}
  sincos: (a) => {
    const t = getNumericType();
    if (t==="f64"){
      const x = f64(a);
      __f64bufF[0] = Math.sin(x); const s = __f64bufF[0];
      __f64bufF[0] = Math.cos(x); const c = __f64bufF[0];
      return { sin: s, cos: c };
    }
    const x = f32(a);
    __f32bufF[0] = Math.sin(x); const s = __f32bufF[0];
    __f32bufF[0] = Math.cos(x); const c = __f32bufF[0];
    return { sin: s, cos: c };
  },
  // 余数（C 风格 fmod）
  fmod: (a,b) => {
    const t=getNumericType();
    if (t==="f64"){
      const ax=f64(a), bx=f64(b);
      __f64bufF[0] = ax/bx; const q = __f64bufF[0];
      __f64bufF[0] = Math.trunc(q); const tq = __f64bufF[0];
      __f64bufF[0] = tq * bx; const p = __f64bufF[0];
      __f64bufF[0] = ax - p; return __f64bufF[0];
    }
    const ax = f32(a), bx = f32(b);
    __f32bufF[0] = ax/bx; const q = __f32bufF[0];
    __f32bufF[0] = Math.trunc(q); const tq = __f32bufF[0];
    __f32bufF[0] = tq * bx; const p = __f32bufF[0];
    __f32bufF[0] = ax - p; return __f32bufF[0];
  },
  // ldexp(x, exp)
  ldexp: (a, iexp) => {
    const t=getNumericType();
    const e = clampExpInt(iexp);
    if (t==="f64"){
      const x=f64(a);
      __f64bufF[0] = x * Math.pow(2, e);
      return __f64bufF[0];
    }
    const x = f32(a);
    __f32bufF[0] = x * Math.pow(2, e);
    return __f32bufF[0];
  },
};

// ===== 新增常用函数（IEEE-754 对齐）实现 =====
// 说明：所有返回值最终经 f32 收敛；遵循 NaN 传播规则；fmax/fmin 的 NaN 规则按 IEEE（若一方是 NaN，返回另一方；两者都是 NaN 返回 NaN）
Ops.abs = (a) => {
  const t = getNumericType();
  if (t === "f64") {
    const u = u64Of(f64(a));
    const v = (u & 0x7fffffffffffffffn);
    return f64OfBits(v);
  }
  return abs32(a);
};
Ops.copysign = (a,b) => { const t=getNumericType(); return t==="f64" ? copysign64(a,b) : copysign32(a,b); };
Ops.fdim = (a,b) => {
  const ax = f32(a), bx = f32(b);
  if (Number.isNaN(ax) || Number.isNaN(bx)) return f32(NaN);
  return ax > bx ? fsub(ax, bx) : f32(0);
};
Ops.fmax = (a,b) => {
  const ax = f32(a), bx = f32(b);
  const aNaN = Number.isNaN(ax), bNaN = Number.isNaN(bx);
  if (aNaN && bNaN) return f32(NaN);
  if (aNaN) return bx;
  if (bNaN) return ax;
  return ax > bx ? ax : bx;
};
Ops.fmin = (a,b) => {
  const ax = f32(a), bx = f32(b);
  const aNaN = Number.isNaN(ax), bNaN = Number.isNaN(bx);
  if (aNaN && bNaN) return f32(NaN);
  if (aNaN) return bx;
  if (bNaN) return ax;
  return ax < bx ? ax : bx;
};
Ops.hypot = (a,b) => {
  const t=getNumericType();
  if (t==="f64"){
    const ax = Math.abs(Number(f64(a)));
    const bx = Math.abs(Number(f64(b)));
    const m = Math.max(ax, bx);
    if (m === 0) return f64(0);
    const na = ax/m, nb = bx/m;
    return f64(m * Math.sqrt(na*na + nb*nb));
  }
  const ax = Math.abs(Number(f32(a)));
  const bx = Math.abs(Number(f32(b)));
  const m = Math.max(ax, bx);
  if (m === 0) return f32(0);
  const na = ax/m, nb = bx/m;
  return f32(m * Math.sqrt(na*na + nb*nb));
};
Ops.trunc = (a) => { __f32bufF[0] = f32(a); __f32bufF[0] = Math.trunc(__f32bufF[0]); return __f32bufF[0]; };
Ops.floor = (a) => { __f32bufF[0] = f32(a); __f32bufF[0] = Math.floor(__f32bufF[0]); return __f32bufF[0]; };
Ops.ceil  = (a) => { __f32bufF[0] = f32(a); __f32bufF[0] = Math.ceil(__f32bufF[0]);  return __f32bufF[0]; };
Ops.round = (a) => { __f32bufF[0] = f32(a); __f32bufF[0] = Math.round(__f32bufF[0]); return __f32bufF[0]; };
Ops.rint  = (a) => {
  // 银行家舍入到最近整数（ties to even）
  const t = getNumericType();
  if (t==="f64"){
    const x = f64(a);
    if (!Number.isFinite(x)) return x;
    const n = Math.trunc(x);
    const frac = x - n;
    if (frac > 0.5) return f64(n + 1);
    if (frac < 0.5) return f64(n);
    const up = n + 1;
    return (n % 2 === 0) ? f64(n) : f64(up);
  }
  const x = f32(a);
  if (!Number.isFinite(x)) return x;
  const n = Math.trunc(x);
  const frac = fsub(x, n);
  if (frac > 0.5) return f32(n + 1);
  if (frac < 0.5) return f32(n);
  const up = n + 1;
  return (n % 2 === 0) ? f32(n) : f32(up);
};
Ops.modf = (a) => {
  const t = getNumericType();
  if (t==="f64"){
    const x = f64(a);
    if (!Number.isFinite(x)) return { frac: f64(NaN), int: x };
    const i = f64(Math.trunc(x));
    const f = f64(x - i);
    return { frac: f, int: i };
  }
  const x = f32(a);
  if (!Number.isFinite(x)) return { frac: f32(NaN), int: x };
  const i = f32(Math.trunc(x));
  const f = fsub(x, i);
  return { frac: f, int: i };
};
Ops.frexp = (a) => {
  const t = getNumericType();
  if (t==="f64"){
    const x = f64(a);
    if (x === 0) return { mant: f64(0), exp: 0 };
    if (!Number.isFinite(x)) return { mant: x, exp: 0 };
    let e = Math.floor(Math.log2(Math.abs(x)));
    const mant = f64(x / Math.pow(2, e));
    if (Math.abs(mant) >= 1) { e += 1; __f64bufF[0] = mant / 2; return { mant: __f64bufF[0], exp: e }; }
    return { mant, exp: e };
  }
  const x = f32(a);
  if (x === 0) return { mant: f32(0), exp: 0 };
  if (!Number.isFinite(x)) return { mant: x, exp: 0 };
  // 规范化到 [0.5,1) 区间
  let e = ilogb32(x); // floor(log2(|x|))
  // mant = x / 2^e
  const mant = f32(x / Math.pow(2, e));
  // 如果刚好等于 1，则调整到 0.5<=|mant|<1
  if (Math.abs(mant) >= 1) { e += 1; __f32bufF[0] = mant / 2; return { mant: __f32bufF[0], exp: e }; }
  return { mant, exp: e };
};
Ops.ilogb = (a) => f32(ilogb32(a)); // 注意：规格要求整数，这里按照返回 float32 的展示；上层 onCalc 会显示十进制数字
Ops.logb  = (a) => logb32(a);
Ops.scalbn  = (a, e) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]= f64(a) * Math.pow(2, e|0); return __f64bufF[0]; } return scalbn32(a, e|0); };
Ops.scalbln = (a, e) => { const t=getNumericType(); if (t==="f64"){ __f64bufF[0]= f64(a) * Math.pow(2, e|0); return __f64bufF[0]; } return scalbn32(a, e|0); };
Ops.nextafter = (a,b) => { const t=getNumericType(); return t==="f64" ? nextafter64(a,b) : nextafter32(a,b); };
Ops.isnan = (a) => { const t=getNumericType(); return t==="f64" ? f64(Number.isNaN(f64(a)) ? 1 : 0) : f32(Number.isNaN(f32(a)) ? 1 : 0); };
Ops.isinf = (a) => {
  const t=getNumericType();
  if (t==="f64"){ const x=f64(a); return f64(!Number.isFinite(x) && !Number.isNaN(x) ? 1 : 0); }
  const x = f32(a);
  return f32(!Number.isFinite(x) && !Number.isNaN(x) ? 1 : 0);
};
Ops.isfinite = (a) => { const t=getNumericType(); return t==="f64" ? f64(Number.isFinite(f64(a)) ? 1 : 0) : f32(Number.isFinite(f32(a)) ? 1 : 0); };
Ops.signbit = (a) => { const t=getNumericType(); return t==="f64" ? f64(signbit64(a)) : f32(signbit32(a)); };

// 误差尽量低的特殊函数实现（Float32 目标）
// 1) lgamma(x): 返回 ln|Gamma(x)|，采用 Lanczos 近似 + 反射公式（修正：严格 ln Γ，不误用 Γ）
(function attachLGamma(){
  // 使用经典 Lanczos (g=7, n=9) 系数，但保留为 double 常量，逐步落位到 Float32
  // 参考：Spouge/Lanczos 常用参数，目标为 float32 精度
  const g = f32(7.0);
  const coeff = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ].map(f32);
  const HALF_LN_2PI = f32(0.91893853320467274178); // 0.5*ln(2π)
  const PI32 = f32(Math.PI);

  // ln Γ(z)，要求 z > 0.5
  function lanczosLogGamma(z){
    // x = c0 + c1/(z) + c2/(z+1) + ...
    let x = coeff[0];
    for (let i = 1; i < coeff.length; i++) {
      const denom = f32(z + f32(i - 1));
      x = f32(x + f32(coeff[i] / denom));
    }
    const t = f32(z + f32(g) - f32(0.5));
    // ln Γ(z) ≈ (z-0.5)ln t - t + 0.5 ln(2π) + ln x
    const term1 = f32(f32(f32(z - f32(0.5))) * f32(Math.log(t)));
    const term2 = f32(-t);
    const term3 = HALF_LN_2PI;
    const term4 = f32(Math.log(x));
    return f32(f32(f32(term1 + term2) + term3) + term4);
  }

  Ops.lgamma = (a) => {
    const z = f32(a);
    // 极点：非正整数
    if (z <= 0 && Math.floor(z) === z) return f32(Infinity);
    if (z < f32(0.5)) {
      // 反射：ln Γ(z) = ln π − ln|sin(π z)| − ln Γ(1−z)
      const pi_z = f32(PI32 * z);
      const sin_piz = f32(Math.sin(pi_z));
      const lnpi = f32(Math.log(PI32));
      const lnAbsSin = f32(Math.log(Math.abs(sin_piz)));
      const one_minus_z = f32(1.0 - z);
      const lg1mz = lanczosLogGamma(one_minus_z);
      return f32(f32(lnpi - lnAbsSin) - lg1mz);
    } else {
      return lanczosLogGamma(z);
    }
  };
})();

// 2) erf(x) 误差函数：使用 Abramowitz-Stegun 7.1.26 近似
(function attachERF(){
  // 常用近似：erf(x) ≈ sign(x) * (1 - t*exp(-x^2)*(a1 + a2 t + a3 t^2 + a4 t^3 + a5 t^4))
  const a1 = f32(0.254829592), a2 = f32(-0.284496736), a3 = f32(1.421413741);
  const a4 = f32(-1.453152027), a5 = f32(1.061405429), p = f32(0.3275911);

  Ops.erf = (a) => {
    const x = f32(a);
    const sgn = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = f32(1 / f32(1 + f32(p*ax)));
    const poly = f32(
      (((f32((((a5*t) + a4)*t) + a3)*t) + a2)*t + a1) * t
    );
    const y = f32(1 - f32(f32(Math.exp(f32(-ax*ax))) * poly));
    return f32(sgn * y);
  };
})();
 
// 2.5) erfc/erfcx/erfcinv/normcdfinv
(function attachERF_Family(){
  const SQRT_PI_INV = 0.5641895835477563; // 1/sqrt(pi)
  const SQRT2 = 1.4142135623730951;

  // erf 已有（Ops.erf）
  // erfc(x) = 1 - erf(x)，注意数值稳定性：|x| 大时直接使用近似
  Ops.erfc = (a) => {
    const t = getNumericType();
    const x = t==="f64" ? f64(a) : f32(a);
    if (Number.isNaN(x)) return t==="f64" ? f64(NaN) : f32(NaN);
    if (x === Infinity) return t==="f64" ? f64(0) : f32(0);
    if (x === -Infinity) return t==="f64" ? f64(2) : f32(2);
    const ax = Math.abs(x);
    // 使用 A&S 7.1.26 的变体直接近似 erfc，避免 1 - erf 的差分损失
    const p = 0.3275911;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    const t1 = 1 / (1 + p*ax);
    const poly = ((((a5*t1 + a4)*t1 + a3)*t1 + a2)*t1 + a1) * t1;
    const e = Math.exp(-ax*ax);
    // erfc(x) ≈ if x>=0: t*e*poly; else: 2 - t*e*poly
    const base = t1 * e * poly;
    const y = x >= 0 ? base : 2 - base;
    return t==="f64" ? f64(y) : f32(y);
  };

  // erfcx(x) = exp(x^2) * erfc(x)；使用稳定形式
  Ops.erfcx = (a) => {
    const t = getNumericType();
    const x = t==="f64" ? f64(a) : f32(a);
    if (Number.isNaN(x)) return t==="f64" ? f64(NaN) : f32(NaN);
    if (x === Infinity) return t==="f64" ? f64(0) : f32(0);
    if (x === -Infinity) return t==="f64" ? f64(Infinity) : f32(Infinity);
    const ax = Math.abs(x);
    // 对中小 x，直接用 A&S 近似：erfcx(x) ≈ t*poly
    // 对大 x，用渐近式：erfcx(x) ~ 1/(sqrt(pi)*x) * (1 + 1/(2x^2) + 3/(4x^4) + ...)
    if (ax > 5) {
      const x2 = x*x;
      const inv = 1/x;
      const inv2 = 1/x2;
      const series = 1 + 0.5*inv2 + 0.75*inv2*inv2;
      const y = (series * inv) * SQRT_PI_INV;
      return t==="f64" ? f64(y) : f32(y);
    } else {
      const p = 0.3275911;
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
      const tt = 1 / (1 + p*ax);
      const poly = ((((a5*tt + a4)*tt + a3)*tt + a2)*tt + a1) * tt;
      // erfcx(x) = e^{x^2} * erfc(x)；用稳定式：对于 x>=0: ≈ tt * poly；x<0: ≈ (2*e^{x^2} - tt*poly)
      if (x >= 0) {
        const y = tt * poly;
        return t==="f64" ? f64(y) : f32(y);
      } else {
        const y = Math.exp(x*x) * 2 - tt * poly;
        return t==="f64" ? f64(y) : f32(y);
      }
    }
  };

  // 逆互补误差函数 erfcinv(y)，y∈[0,2]；牛顿迭代 2-3 步
  Ops.erfcinv = (ya) => {
    const t = getNumericType();
    const y = t==="f64" ? f64(ya) : f32(ya);
    if (Number.isNaN(y)) return t==="f64" ? f64(NaN) : f32(NaN);
    if (y <= 0) return t==="f64" ? f64(Infinity) : f32(Infinity);
    if (y >= 2) return t==="f64" ? f64(-Infinity) : f32(-Infinity);
    if (y === 1) return t==="f64" ? f64(0) : f32(0);

    // 初值：利用 probit 近似，erfcinv(y) = -Phi^{-1}(y/2)/sqrt(2)
    function approxInvNorm(p){
      // Moro/Beasley-Springer 近似
      const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
      const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
      const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
                 0.0276438810333863, 0.0038405729373609, 0.0003951896511919,
                 0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
      const pp = p;
      if (pp < 0 || pp > 1) return NaN;
      if (pp === 0) return -Infinity;
      if (pp === 1) return Infinity;
      const y1 = pp - 0.5;
      if (Math.abs(y1) < 0.42) {
        const r = y1 * y1;
        const num = (((a[3]*r + a[2])*r + a[1])*r + a[0]) * y1;
        const den = ((((b[3]*r + b[2])*r + b[1])*r + b[0]) * r + 1.0);
        return num / den;
      } else {
        const r = pp < 0.5 ? pp : 1 - pp;
        const s = Math.log(-Math.log(r));
        let t0 = c[0] + s*(c[1] + s*(c[2] + s*(c[3] + s*(c[4] + s*(c[5] + s*(c[6] + s*(c[7] + s*c[8])))))));
        return pp < 0.5 ? -t0 : t0;
      }
    }
    const p = y/2;
    let x = -approxInvNorm(p)/SQRT2;

    // 牛顿迭代：f(x)=erfc(x)-y；f'(x)=-2/sqrt(pi)*exp(-x^2)
    for (let i=0; i<3; i++){
      const fx = Number(Ops.erfc(x)); // 使用上面稳定的 erfc 实现
      const dfx = -2 * SQRT_PI_INV * Math.exp(-x*x);
      const step = (fx - y)/dfx;
      x = x - step;
    }
    return t==="f64" ? f64(x) : f32(x);
  };

  // 标准正态分布逆 CDF：normcdfinv(p)
  Ops.normcdfinv = (pa) => {
    const t = getNumericType();
    const p = t==="f64" ? f64(pa) : f32(pa);
    if (Number.isNaN(p)) return t==="f64" ? f64(NaN) : f32(NaN);
    if (p <= 0) return t==="f64" ? f64(-Infinity) : f32(-Infinity);
    if (p >= 1) return t==="f64" ? f64(Infinity) : f32(Infinity);
    // x = -sqrt(2) * erfcinv(2p)
    const x = -SQRT2 * Number(Ops.erfcinv(2*p));
    return t==="f64" ? f64(x) : f32(x);
  };
})();
 
// 3) Bessel 与修正 Bessel：j0, j1, y1, i0, i1
// 采用分段：小 x 用级数/有理逼近；大 x 用渐近公式。
// 这些实现基于常见近似形式，针对 Float32 做简化，满足常用区间精度。
(function attachGamma(){
  // 基于已实现的 Ops.lgamma，构建 Γ(x) = signGamma(x) * exp(lgamma(x))
  // 对于 x>0，sign=+1；对于非正非整数的 x，Gamma 在区间间隔交替符号，符号为 sign(sin(πx)) 的倒数。
  Ops.tgamma = (a) => {
    const x = f32(a);
    if (x === 0 || (!Number.isFinite(x))) {
      // Γ(±∞) 未定义：按数学极限，+∞ 时 Γ(∞)=∞，但这里仅处理有限输入；NaN/Inf 直接传播
      return f32(NaN);
    }
    // 极点：非正整数
    if (x <= 0 && Math.floor(x) === x) return f32(Infinity);
    // 使用反射关系的符号：signGamma(x) = sign(π / (sin(πx) * Γ(1-x) * Γ(x))) —— 实际更稳定使用 sin(πx)
    // 实作：Gamma(x) = π / (sin(πx) * Γ(1-x)) 对 x<0.5，或直接 exp(lgamma(x)) 对 x≥0.5
    if (x < f32(0.5)) {
      const pi = f32(Math.PI);
      const sinpix = f32(Math.sin(f32(pi * x)));
      if (sinpix === 0) return f32(Infinity);
      const oneMinus = f32(1.0 - x);
      const lnG = Ops.lgamma(oneMinus); // ln Γ(1-x)
      // Γ(x) = π / (sin(πx) * Γ(1-x))
      const denom = f32(f32(sinpix) * f32(Math.exp(lnG)));
      return f32(f32(pi) / denom);
    } else {
      const lnG = Ops.lgamma(x);
      return f32(Math.exp(lnG));
    }
  };
})();
 
(function attachBessel(){
  // y0(x) — 第二类贝塞尔函数 Y0，注意 x<=0 定义域发散为 -Inf
  Ops.y0 = (a) => {
    const x = f32(a);
    if (x <= 0) return f32(-Infinity);
    const ax = Math.abs(x);
    if (ax <= 8.0) {
      const y = f32(x*x);
      // 多项式系数采用常见实现的单精度近似
      const r = f32(
        (((((-2957821389.0*y + 7062834065.0)*y - 512359803.6)*y + 10879881.29)*y - 86327.92757)*y + 228.4622733)
      );
      const s = f32(
        (((((40076544269.0*y + 745249964.8)*y + 7189466.438)*y + 47447.26470)*y + 226.1030244)*y + 1.0)
      );
      // Y0(x) ≈ (2/π)(ln(x) * J0(x)) + R(y)/S(y)
      const j0 = Ops.j0(x);
      const twoOverPi = f32(0.6366197723675814);
      return f32(f32(r/s) + f32(twoOverPi * f32(j0 * Math.log(x))));
    } else {
      // 渐近展开
      const z = f32(8.0/ax);
      const y = f32(z*z);
      const xx = f32(ax - f32(0.7853981633974483)); // π/4
      const p = f32(
        (1.0 + f32(0.183105e-2*y) - f32(0.3516396496e-4*y*y) + f32(0.2457520174e-6*y*y*y) - f32(0.240337019e-8*y*y*y*y))
      );
      const q = f32(
        (-0.04687499995 + f32(0.2002690873e-3*y) - f32(0.8449199096e-6*y*y) + f32(0.88228987e-8*y*y*y) - f32(0.105787412e-10*y*y*y*y))
      );
      // Y0(x) ≈ sqrt(2/(πx)) * (p*sin(xx) + z*q*cos(xx))
      return f32(f32(Math.sqrt(f32(0.636619772/ax))) * f32(f32(p*Math.sin(xx)) + f32(z*q*Math.cos(xx))));
    }
  };

  // j0 三段实现（Cephes/FDLIBM 风格）：
  // 1) |x| <= 2: 级数近似 J0(x) ≈ 1 + y*P(y), y=x^2
  // 2) 2 < |x| <= 8: 有理逼近 J0(x) ≈ R(y)/S(y), y=x^2
  // 3) |x| > 8: 渐近展开 sqrt(2/(πx))*(p(y)cos(xx) - z q(y) sin(xx)), z=8/x, y=z^2, xx=x-π/4
  Ops.j0 = (a) => {
    const x = f32(a);
    const ax = Math.abs(x);

    if (ax <= 2.0) {
      const y = f32(x * x);
      // 低阶稳定系数，按 Float32 落位
      const p1 = f32(-0.25);
      const p2 = f32(0.015625);            // 1/64
      const p3 = f32(-0.00043402778);
      const p4 = f32(0.000006781684);
      const poly = f32(p1 + f32(y * f32(p2 + f32(y * f32(p3 + f32(y * p4))))));
      return f32(1.0 + f32(y * poly));
    }

    if (ax <= 8.0) {
      const y = f32(x * x);
      const r = f32(
        f32(
          f32(
            f32(
              f32(
                f32(57568490574.0) * y - 13362590354.0
              ) * y + 651619640.7
            ) * y - 11214424.18
          ) * y + 77392.33017
        ) * y - 184.9052456
      );
      const s = f32(
        f32(
          f32(
            f32(
              f32(
                f32(
                  f32(57568490411.0) * y + 1029532985.0
                ) * y + 9494680.718
              ) * y + 59272.64853
            ) * y + 267.8532712
          ) * y + 1.0
        )
      );
      return f32(r / s);
    }

    // 渐近：|x|>8
    const z = f32(8.0 / ax);
    const y = f32(z * z);
    const xx = f32(ax - f32(0.7853981633974483096)); // pi/4
    const p = f32(
      f32(
        f32(
          f32(1.0) - f32(0.1098628627) * y
        ) + f32(0.2734510407) * f32(y * y)
      ) - f32(0.2073370639) * f32(y * y * y)
    );
    const q = f32(
      f32(
        f32(-0.1562499995) + f32(0.1430488765) * y
      ) - f32(0.6911147651) * f32(y * y)
    );
    const amp = f32(Math.sqrt(f32(0.636619772 / ax))); // sqrt(2/(pi*x))
    return f32(amp * f32(f32(p * Math.cos(xx)) - f32(z * q * Math.sin(xx))));
  };

  // j1 三段：|x|<=2 级数；2<|x|<=8 有理逼近；|x|>8 渐近
  Ops.j1 = (a) => {
    const x = f32(a);
    const ax = Math.abs(x);

    if (ax <= 2.0) {
      const y = f32(x * x);
      // J1(x) ≈ x * (1/2 + y*(-1/16 + y*(1/384 + y*(-1/18432))))
      const p1 = f32(0.5);
      const p2 = f32(-0.0625);            // -1/16
      const p3 = f32(0.0026041667);       // 1/384
      const p4 = f32(-0.000054253472);    // -1/18432
      const poly = f32(p1 + f32(y * f32(p2 + f32(y * f32(p3 + f32(y * p4))))));
      return f32(x * poly);
    }

    if (ax <= 8.0) {
      const y = f32(x*x);
      const r = f32(
        ((((((72362614232.0*y - 7895059235.0)*y + 242396853.1)*y - 2972611.439)*y + 15704.48260)*y - 30.16036606))
      );
      const s = f32(
        ((((((144725228442.0*y + 2300535178.0)*y + 18583304.74)*y + 99447.43394)*y + 376.9991397)*y + 1.0))
      );
      return f32(x * f32(r/s));
    }

    const z = f32(8.0/ax);
    const y = f32(z*z);
    const xx = f32(ax - f32(2.356194490192345)); // 3*pi/4
    const p = f32(1.0 + f32(0.183105e-2*y) - f32(0.3516396496e-4*y*y) + f32(0.2457520174e-6*y*y*y) - f32(0.240337019e-8*y*y*y*y));
    const q = f32(0.04687499995 - f32(0.2002690873e-3*y) + f32(0.8449199096e-6*y*y) - f32(0.88228987e-8*y*y*y) + f32(0.105787412e-10*y*y*y*y));
    const res = f32(f32(Math.sqrt(f32(0.636619772/ax))) * f32(f32(p*Math.cos(xx)) - f32(z*q*Math.sin(xx))));
    return x < 0 ? f32(-res) : res;
  };

  // y1(x) — 与 j0/j1 同源系数；小区间同样使用 r/s，并带对数项组合
  Ops.y1 = (a) => {
    const x = f32(a);
    if (x <= 0) return f32(-Infinity);
    const ax = Math.abs(x);

    if (ax < 8.0) {
      const y = f32(x * x);
      const r = f32(
        f32(x) * f32(
          f32(
            f32(
              f32(
                f32(
                  f32(
                    f32(-0.4900604943e13) * y + 0.1275274390e13
                  ) * y - 0.5153438139e11
                ) * y + 0.7349264551e9
              ) * y - 0.4237922726e7
            ) * y + 0.8511937935e4
          )
        )
      );
      const s = f32(
        f32(
          f32(
            f32(
              f32(
                f32(
                  f32(0.2499580570e14) * y + 0.4244419664e12
                ) * y + 0.3733650367e10
              ) * y + 0.2245904002e8
            ) * y + 0.1020426050e6
          ) * y + 0.3549632885e3
        ) * y + 1.0
      );
      const twoOverPi = f32(0.63661977236758134308);
      // y1(x) ≈ (x*r/s) + (2/π)*(j0(x)*ln(x) - j1(x))
      return f32(f32(r / s) + twoOverPi * f32(f32(Ops.j0(x)) * f32(Math.log(x)) - Ops.j1(x)));
    }

    const z = f32(8.0 / ax);
    const y = f32(z * z);
    const xx = f32(ax - f32(2.3561944901923449288469825374596)); // 3*pi/4
    const p = f32(
      f32(
        f32(1.0) + f32(0.183105e-2) * y
      ) - f32(0.3516396496e-4) * f32(y * y)
    );
    const q = f32(
      f32(0.04687499995) - f32(0.2002690873e-3) * y
    );
    const amp = f32(Math.sqrt(f32(0.636619772 / ax)));
    return f32(amp * f32(f32(p * Math.sin(xx)) + f32(z * q * Math.cos(xx))));
  };

  // 修正 Bessel I0, I1 — 采用近似
  Ops.i0 = (a) => {
    const x = Math.abs(f32(a));
    if (x < 3.75) {
      const y = (x/3.75); const y2 = f32(y*y);
      const r = 1.0 + y2*(3.5156229 + y2*(3.0899424 + y2*(1.2067492 + y2*(0.2659732 + y2*(0.0360768 + y2*0.0045813)))));
      return f32(r);
    } else {
      const y = 3.75/x;
      const r = f32((Math.exp(x)/Math.sqrt(x)) *
        (0.39894228 + y*(0.01328592 + y*(0.00225319 + y*(-0.00157565 + y*(0.00916281 + y*(-0.02057706 + y*(0.02635537 + y*(-0.01647633 + y*0.00392377))))))))
      );
      return r;
    }
  };
  Ops.i1 = (a) => {
    const x = f32(a);
    const ax = Math.abs(x);
    if (ax < 3.75) {
      const y = (ax/3.75); const y2 = f32(y*y);
      const r = ax * (0.5 + y2*(0.87890594 + y2*(0.51498869 + y2*(0.15084934 + y2*(0.02658733 + y2*(0.00301532 + y2*0.00032411))))));
      return f32(x < 0 ? -r : r);
    } else {
      const y = 3.75/ax;
      const r = f32((Math.exp(ax)/Math.sqrt(ax)) *
        (0.39894228 + y*(-0.03988024 + y*(-0.00362018 + y*(0.00163801 + y*(-0.01031555 + y*(0.02282967 + y*(-0.02895312 + y*(0.01787654 - y*0.00420059))))))))
      );
      return f32(x < 0 ? -r : r);
    }
  };
})();

// 输入配置与函数元数
const FunctionMeta = [
  { key:"add", name:"add(a,b)", args:["a","b"] },
  { key:"sub", name:"sub(a,b)", args:["a","b"] },
  { key:"mul", name:"mul(a,b)", args:["a","b"] },
  { key:"div", name:"div(a,b)", args:["a","b"] },
  { key:"fma", name:"fma(a,b,c)", args:["a","b","c"] },
  { key:"sqrt", name:"sqrt(a)", args:["a"] },
  { key:"rsqrt", name:"rsqrt(a)", args:["a"] },
  { key:"ldexp", name:"ldexp(a,exp)", args:["a","exp"] },
  { key:"pow", name:"pow(a,b)", args:["a","b"] },
  { key:"log", name:"log(a)", args:["a"] },
  { key:"log2", name:"log2(a)", args:["a"] },
  { key:"log1p", name:"log1p(a)", args:["a"] },
  { key:"exp", name:"exp(a)", args:["a"] },
  { key:"exp10", name:"exp10(a)", args:["a"] },
  { key:"expm1", name:"expm1(a)", args:["a"] },
  { key:"fmod", name:"fmod(a,b)", args:["a","b"] },
  { key:"lgamma", name:"lgamma(a)", args:["a"] },
  { key:"erf", name:"erf(a)", args:["a"] },
  { key:"erfc", name:"erfc(a)", args:["a"] },
  { key:"erfcx", name:"erfcx(a)", args:["a"] },
  { key:"erfcinv", name:"erfcinv(a)", args:["a"] },
  { key:"normcdfinv", name:"normcdfinv(p)", args:["a"] },
  { key:"sinh", name:"sinh(a)", args:["a"] },
  { key:"tanh", name:"tanh(a)", args:["a"] },
  { key:"y0", name:"y0(a)", args:["a"] },
  { key:"y1", name:"y1(a)", args:["a"] },
  { key:"sincos", name:"sincos(a)", args:["a"] },
  { key:"cosh", name:"cosh(a)", args:["a"] },

  // 常用便捷三角
  { key:"sin",  name:"sin(a)", args:["a"] },
  { key:"cos",  name:"cos(a)", args:["a"] },
  { key:"tan",  name:"tan(a)", args:["a"] },
  { key:"sinpi",  name:"sinpi(a)=sin(π·a)", args:["a"] },
  { key:"cospi",  name:"cospi(a)=cos(π·a)", args:["a"] },
  { key:"j0", name:"j0(a)", args:["a"] },
  { key:"j1", name:"j1(a)", args:["a"] },
  { key:"i0", name:"i0(a)", args:["a"] },
  { key:"i1", name:"i1(a)", args:["a"] },

  // 常用便捷三角
  { key:"sin",  name:"sin(a)", args:["a"] },
  { key:"cos",  name:"cos(a)", args:["a"] },
  { key:"sinpi",  name:"sinpi(a)=sin(π·a)", args:["a"] },
  { key:"cospi",  name:"cospi(a)=cos(π·a)", args:["a"] },

  // 正三角（倒数函数）
  { key:"sec",  name:"sec(a)=1/cos(a)", args:["a"] },
  { key:"csc",  name:"csc(a)=1/sin(a)", args:["a"] },
  { key:"cot",  name:"cot(a)=1/tan(a)", args:["a"] },

  // 新增三角相关函数（扩展）
  { key:"asin", name:"asin(a)", args:["a"] },
  { key:"acos", name:"acos(a)", args:["a"] },
  { key:"atan", name:"atan(a)", args:["a"] },
  { key:"atan2", name:"atan2(a,b)", args:["a","b"] },
  { key:"asinh", name:"asinh(a)", args:["a"] },
  { key:"acosh", name:"acosh(a)", args:["a"] },
  { key:"atanh", name:"atanh(a)", args:["a"] },

  // 新增常用函数（IEEE-754 对齐）
  { key:"abs", name:"abs(a)", args:["a"] },
  { key:"copysign", name:"copysign(a,b)", args:["a","b"] },
  { key:"fdim", name:"fdim(a,b)", args:["a","b"] },
  { key:"fmax", name:"fmax(a,b)", args:["a","b"] },
  { key:"fmin", name:"fmin(a,b)", args:["a","b"] },
  { key:"hypot", name:"hypot(a,b)", args:["a","b"] },
  { key:"trunc", name:"trunc(a)", args:["a"] },
  { key:"floor", name:"floor(a)", args:["a"] },
  { key:"ceil",  name:"ceil(a)", args:["a"] },
  { key:"round", name:"round(a)", args:["a"] },
  { key:"rint",  name:"rint(a)", args:["a"] },
  { key:"modf",  name:"modf(a)->{frac,int}", args:["a"] },
  { key:"frexp", name:"frexp(a)->{mant,exp}", args:["a"] },
  { key:"ilogb", name:"ilogb(a)", args:["a"] },
  { key:"logb",  name:"logb(a)", args:["a"] },
  { key:"scalbn", name:"scalbn(a,exp)", args:["a","exp"] },
  { key:"scalbln", name:"scalbln(a,exp)", args:["a","exp"] },
  { key:"nextafter", name:"nextafter(a,b)", args:["a","b"] },
  { key:"isnan", name:"isnan(a)", args:["a"] },
  { key:"isinf", name:"isinf(a)", args:["a"] },
  { key:"isfinite", name:"isfinite(a)", args:["a"] },
  { key:"signbit", name:"signbit(a)", args:["a"] },
  // 新增：Gamma 函数（返回 Γ(a) 本身，而非 ln Γ）
  { key:"tgamma", name:"tgamma(a)", args:["a"] },
];

// UI 逻辑
function initUI() {
  const funcSelect = document.getElementById("func");
  FunctionMeta.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.key;
    opt.textContent = f.name;
    funcSelect.appendChild(opt);
  });

  // 在操作区追加“数据类型选择器 + 舍入模式选择器 + 生成C++代码”按钮
  const actions = document.querySelector(".actions");
  if (actions) {
    // 如果旧的“生成C代码”按钮存在，先移除以避免重复入口
    const oldBtn = document.getElementById("btn-gen-c");
    if (oldBtn) oldBtn.remove();

    // 数据类型选择器
    let tsel = document.getElementById("numeric-type");
    if (!tsel) {
      tsel = document.createElement("select");
      tsel.id = "numeric-type";
      tsel.title = "数据类型（影响所有函数的计算/显示/位型）";
      tsel.style.marginRight = "8px";
      [
        {v:"f32", t:"类型: float32"},
        {v:"f64", t:"类型: float64"},
      ].forEach(o => {
        const opt = document.createElement("option");
        opt.value = o.v; opt.textContent = o.t;
        tsel.appendChild(opt);
      });
      // 恢复本地类型
      let savedT = "f32";
      try { const v = localStorage.getItem("numeric.type"); if (v==="f64"||v==="f32") savedT=v; } catch {}
      tsel.value = savedT;
      setNumericType(savedT);
      tsel.addEventListener("change", () => {
        const v = tsel.value === "f64" ? "f64" : "f32";
        setNumericType(v);
        setStatus(`类型: ${v.toUpperCase()} | 舍入: ${getRoundingMode()}`, "ok");
        // 重新绑定双通道以切换解析/渲染为 32/64 位
        bindDualInput("arg-a-dec","arg-a-hex");
        bindDualInput("arg-b-dec","arg-b-hex");
        bindDualInput("arg-c-dec","arg-c-hex");
      });
      actions.appendChild(tsel);
    }

    // 舍入模式选择器
    let rsel = document.getElementById("rounding-mode");
    if (!rsel) {
      rsel = document.createElement("select");
      rsel.id = "rounding-mode";
      rsel.title = "舍入模式（仅影响加减乘除与fma）";
      rsel.style.marginRight = "8px";
      [
        {v:"RN", t:"舍入: 最近偶数 (RN)"},
        {v:"RZ", t:"舍入: 向零 (RZ)"},
        {v:"RU", t:"舍入: 向上 (RU)"},
        {v:"RD", t:"舍入: 向下 (RD)"},
      ].forEach(o => {
        const opt = document.createElement("option");
        opt.value = o.v; opt.textContent = o.t;
        rsel.appendChild(opt);
      });
      // 恢复本地模式
      let saved = null;
      try { saved = localStorage.getItem("rounding.mode"); } catch {}
      if (saved && (saved in RMode)) {
        rsel.value = saved;
        setRoundingMode(saved);
      } else {
        rsel.value = "RN";
        setRoundingMode("RN");
      }
      rsel.addEventListener("change", () => {
        const v = rsel.value;
        setRoundingMode(v);
        setStatus(`类型: ${getNumericType().toUpperCase()} | 舍入: ${v}`, "ok");
      });
      actions.appendChild(rsel);
    }

    if (!document.getElementById("btn-gen-cpp")) {
      const btn = document.createElement("button");
      btn.id = "btn-gen-cpp";
      btn.textContent = "生成C++代码";
      actions.appendChild(btn);

      btn.addEventListener("click", () => {
        const code = generateCppSourceFromCurrent();
        let pre = document.getElementById("c-code-output");
        let copyBtn = document.getElementById("btn-copy-cpp");

        // 如果第一次生成，则创建面板并插入到“结果面板之后、函数速选面板之前”
        if (!pre) {
          const panel = document.createElement("div");
          panel.className = "result";

          const headerRow = document.createElement("div");
          headerRow.style.display = "flex";
          headerRow.style.alignItems = "center";
          headerRow.style.justifyContent = "space-between";

          const h2 = document.createElement("h2");
          h2.textContent = "C++ 源码";

          const copy = document.createElement("button");
          copy.id = "btn-copy-cpp";
          copy.textContent = "复制源码";
          copy.style.marginLeft = "12px";
          copy.style.padding = "6px 10px";
          copy.style.border = "1px solid var(--border)";
          copy.style.borderRadius = "6px";
          copy.style.background = "var(--panel2)";
          copy.style.color = "var(--fg)";

          headerRow.appendChild(h2);
          headerRow.appendChild(copy);

          pre = document.createElement("pre");
          pre.id = "c-code-output";
          pre.style.whiteSpace = "pre-wrap";
          pre.style.wordBreak = "break-word";

          // Wandbox 提示区域（可点击链接），不混入源码内部
          const tip = document.createElement("div");
          tip.id = "cpp-tip";
          tip.className = "mono";
          tip.style.marginTop = "8px";
          tip.style.fontSize = "12px";
          tip.style.opacity = "0.9";
          tip.innerHTML = '在线编译/运行建议使用 <a href="https://wandbox.org/" target="_blank" rel="noopener noreferrer">wandbox.org</a>（选择支持 C++17 的编译器，例如 GCC 12+/Clang 14+）。本地编译请使用 -std=c++17 或更新标准。';

          panel.appendChild(headerRow);
          panel.appendChild(tip);
          panel.appendChild(pre);

          const main = document.querySelector("main");
          // 定位现有“结果面板”（假设为 class="result" 且包含输出字段），与“函数速选面板”（id="test-buttons" 容器）
          const resultsPanel = document.querySelector(".result"); // 页面已有的第一个结果面板
          const quickPanelWrap = document.querySelector("#test-buttons")?.parentElement?.parentElement
                               || document.querySelector("#test-buttons")?.parentElement
                               || document.getElementById("test-buttons");

          if (main) {
            if (resultsPanel && quickPanelWrap && resultsPanel !== panel) {
              // 插入到结果面板之后、函数速选面板之前
              // 先尝试在 quickPanelWrap 之前插入
              if (quickPanelWrap.parentElement === main) {
                main.insertBefore(panel, quickPanelWrap);
              } else if (resultsPanel.parentElement === main) {
                // 回退：直接在结果面板之后插入
                if (resultsPanel.nextSibling) {
                  main.insertBefore(panel, resultsPanel.nextSibling);
                } else {
                  main.appendChild(panel);
                }
              } else {
                // 兜底：追加到 main 尾部
                main.appendChild(panel);
              }
            } else if (resultsPanel && resultsPanel.parentElement) {
              // 如果找不到 test-buttons 的容器，至少保证在结果面板之后
              const parent = resultsPanel.parentElement;
              if (resultsPanel.nextSibling) {
                parent.insertBefore(panel, resultsPanel.nextSibling);
              } else {
                parent.appendChild(panel);
              }
            } else {
              // 最终兜底
              main.appendChild(panel);
            }
          }
          copyBtn = copy;
        } else {
          // 若已存在，仅更新标题并补充复制按钮
          const headerRow = pre.previousElementSibling;
          const h2 = headerRow && headerRow.querySelector ? headerRow.querySelector("h2") : null;
          if (h2) h2.textContent = "C++ 源码";
          if (!copyBtn && headerRow && headerRow.appendChild) {
            const copy = document.createElement("button");
            copy.id = "btn-copy-cpp";
            copy.textContent = "复制源码";
            copy.style.marginLeft = "12px";
            copy.style.padding = "6px 10px";
            copy.style.border = "1px solid var(--border)";
            copy.style.borderRadius = "6px";
            copy.style.background = "var(--panel2)";
            copy.style.color = "var(--fg)";
            headerRow.appendChild(copy);
            copyBtn = copy;
          }
        }

        // 写入源码
        pre.textContent = code;

        // 一键复制
        if (copyBtn) {
          copyBtn.onclick = async () => {
            try {
              await navigator.clipboard.writeText(pre.textContent);
              copyBtn.textContent = "已复制";
              setTimeout(()=>{ copyBtn.textContent = "复制源码"; }, 1200);
            } catch {
              // 回退：选中全部文本提示手动复制
              try {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(pre);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch {}
              alert("无法直接访问剪贴板，已选中全部源码，请使用 Ctrl+C 复制。");
            }
          };
        }

        // 兼容的自动复制尝试（不影响按钮）
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(code).catch(()=>{});
        }
        const tlog = document.getElementById("test-log");
        if (tlog) tlog.textContent = "[gen-cpp] 已生成 C++ 源码";
      });
    }
  }

  // 绑定双通道输入联动（a,b,c）
  bindDualInput("arg-a-dec","arg-a-hex");
  bindDualInput("arg-b-dec","arg-b-hex");
  bindDualInput("arg-c-dec","arg-c-hex");

  funcSelect.addEventListener("change", syncInputs);
  document.getElementById("btn-calc").addEventListener("click", onCalc);
  document.getElementById("btn-clear").addEventListener("click", onClear);
  document.getElementById("btn-fill-examples").addEventListener("click", fillExamples);

  syncInputs();
  initTests();
  setHint("输入支持十进制与十六进制位型双通道联动。", "ok");
}

function syncInputs() {
  const key = document.getElementById("func").value;
  const meta = FunctionMeta.find(m => m.key === key);
  const rows = document.querySelectorAll("#inputs .row");
  rows.forEach(r => r.classList.add("hidden"));
  if (!meta) return;
  meta.args.forEach(a => {
    const el = document.querySelector(`#inputs .row[data-arg="${a}"]`);
    if (el) el.classList.remove("hidden");
  });
  setHint(hintFor(key), "warn");
}

function parseArg(id, asInt=false) {
  // 新版：按当前 numeric type 精确解析（避免 f64 被提前落到 f32 而截断低 32 位）
  if (!asInt) {
    const map = {
      "arg-a": ["arg-a-dec","arg-a-hex"],
      "arg-b": ["arg-b-dec","arg-b-hex"],
      "arg-c": ["arg-c-dec","arg-c-hex"]
    };
    if (id in map) {
      const [decId, hexId] = map[id];
      const decRaw = document.getElementById(decId)?.value ?? "";
      const hexRaw = document.getElementById(hexId)?.value ?? "";
      const decVal = (decRaw || "").trim();
      const hexVal = (hexRaw || "").trim();
      const t = getNumericType(); // "f32" | "f64"

      // 十进制优先（支持 NaN/±Inf 文本）
      if (decVal !== "") {
        if (/^(nan)$/i.test(decVal)) return t==="f64" ? f64(NaN) : f32(NaN);
        if (/^[+-]?inf(inity)?$/i.test(decVal)) {
          const sgnNeg = decVal[0] === '-';
          return t==="f64" ? f64(sgnNeg ? -Infinity : Infinity) : f32(sgnNeg ? -Infinity : Infinity);
        }
        const n = Number(decVal);
        return Number.isNaN(n) ? NaN : (t==="f64" ? f64(n) : f32(n));
      }

      // 十六进制位型（按类型分别解析）
      if (hexVal !== "") {
        return t==="f64" ? parseF64Input(hexVal) : parseF32Input(hexVal);
      }
      return NaN;
    }
  }
  // 其他（如 exp 整数）
  const v = document.getElementById(id)?.value?.trim?.() ?? "";
  if (v === "") return NaN;
  if (asInt) {
    const num = parseInt(v,10);
    return Number.isNaN(num) ? NaN : (num|0);
  }
  // 非整数但没命中 a/b/c 时，回退到按当前类型解析（与双通道一致）
  const t = getNumericType();
  return t==="f64" ? parseF64Input(v) : parseF32Input(v);
}

function onCalc() {
  setStatus("", "");
  const key = document.getElementById("func").value;
  const meta = FunctionMeta.find(m => m.key === key);
  if (!meta) return;

  try {
    let y;
    switch (key) {
      case "add": case "sub": case "mul": case "div":
      case "pow": case "fmod":
        {
          const a = parseArg("arg-a");
          const b = parseArg("arg-b");
          domainCheckBinary(key, a, b);
          y = Ops[key](a,b);
        }
        break;
      case "fma":
        {
          const a = parseArg("arg-a");
          const b = parseArg("arg-b");
          const c = parseArg("arg-c");
          y = Ops.fma(a,b,c);
        }
        break;
      case "ldexp":
        {
          const a = parseArg("arg-a");
          const e = parseArg("arg-exp", true);
          y = Ops.ldexp(a, e);
        }
        break;
      case "sqrt": case "rsqrt": case "log": case "log2":
      case "log1p": case "exp": case "exp10": case "expm1":
      case "lgamma": case "erf": case "erfc": case "erfcx": case "erfcinv": case "normcdfinv":
      case "sinh": case "tanh":
      case "y0": case "y1": case "cosh": case "j0": case "j1": case "i0": case "i1":
      case "tgamma":
      case "sin": case "cos": case "sinpi": case "cospi":
      case "sec": case "csc": case "cot":
      case "asin": case "acos": case "atan":
      case "asinh": case "acosh": case "atanh":
      case "abs": case "trunc": case "floor": case "ceil": case "round":
      case "rint": case "ilogb": case "logb": case "isnan": case "isinf":
      case "isfinite": case "signbit":
        {
          const a = parseArg("arg-a");
          domainCheckUnary(key, a);
          y = Ops[key](a);
        }
        break;
      case "copysign": case "fdim": case "fmax": case "fmin": case "hypot":
      case "nextafter":
      case "atan2":
        {
          const a = parseArg("arg-a");
          const b = parseArg("arg-b");
          domainCheckBinary(key, a, b);
          y = Ops[key](a, b);
        }
        break;
      case "scalbn": case "scalbln":
        {
          const a = parseArg("arg-a");
          const e = parseArg("arg-exp", true);
          y = Ops[key](a, e);
        }
        break;
      case "modf":
        {
          const a = parseArg("arg-a");
          const r = Ops.modf(a);
          const t = getNumericType();
          const toHex = t==="f64" ? bitsF64 : bitsF32;
          document.getElementById("out-dec").textContent = `frac=${decStr(r.frac)}, int=${decStr(r.int)}`;
          document.getElementById("out-sci").textContent = `frac=${sciStr(r.frac)}, int=${sciStr(r.int)}`;
          document.getElementById("out-hex").textContent = `frac=${toHex(r.frac)}, int=${toHex(r.int)}`;
          setStatus("OK","ok");
          return;
        }
      case "frexp":
        {
          const a = parseArg("arg-a");
          const r = Ops.frexp(a);
          const t = getNumericType();
          const toHex = t==="f64" ? bitsF64 : bitsF32;
          document.getElementById("out-dec").textContent = `mant=${decStr(r.mant)}, exp=${r.exp}`;
          document.getElementById("out-sci").textContent = `mant=${sciStr(r.mant)}, exp=${r.exp}`;
          document.getElementById("out-hex").textContent = `mant=${toHex(r.mant)}, exp=${r.exp}`;
          setStatus("OK","ok");
          return;
        }
      case "sincos":
        {
          const a = parseArg("arg-a");
          const r = Ops.sincos(a);
          const t = getNumericType();
          const toHex = t==="f64" ? bitsF64 : bitsF32;
          // sincos 特殊显示
          document.getElementById("out-dec").textContent = `sin=${decStr(r.sin)}, cos=${decStr(r.cos)}`;
          document.getElementById("out-sci").textContent = `sin=${sciStr(r.sin)}, cos=${sciStr(r.cos)}`;
          document.getElementById("out-hex").textContent = `sin=${toHex(r.sin)}, cos=${toHex(r.cos)}`;
          setStatus("OK", "ok");
          return;
        }
      default:
        throw new Error("未实现函数: "+key);
    }
    setOutputs(y);
    if (Number.isNaN(y)) setStatus("NaN", "warn");
    else if (!Number.isFinite(y)) setStatus(String(y), "warn");
    else setStatus("OK", "ok");

    // 记录历史（容错调用，避免未定义时报错）
    if (typeof window.appendHistory === "function" && typeof window.readCurrentInputsSnapshot === "function") {
      window.appendHistory({
        key,
        inputs: window.readCurrentInputsSnapshot(key),
        result: y
      });
    }
  } catch (e) {
    setStatus("错误: " + (e.message||e), "err");
    // 失败也记录（容错）
    if (typeof window.appendHistory === "function" && typeof window.readCurrentInputsSnapshot === "function") {
      window.appendHistory({
        key,
        inputs: window.readCurrentInputsSnapshot(key),
        error: (e && e.message) ? e.message : String(e)
      });
    }
  }
}

function onClear() {
  // 清空新双通道与 exp
  ["arg-a-dec","arg-a-hex","arg-b-dec","arg-b-hex","arg-c-dec","arg-c-hex","arg-exp"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setOutputs(0);
  setStatus("已清空", "");
}

function hintFor(key) {
  const hexTip = "支持十六进制 Float32 位型输入（如 0x3f800000 或 3f800000）。";
  // 统一追加到末尾的辅助说明
  const tail = (s) => s + " " + hexTip;

  switch(key){
    // 基础双目
    case "add": return tail("add(a,b): 返回 a+b，结果在 Float32 域内单次舍入。");
    case "sub": return tail("sub(a,b): 返回 a-b，Float32 单次舍入。");
    case "mul": return tail("mul(a,b): 返回 a*b，Float32 单次舍入。");
    case "div": return tail("div(a,b): 返回 a/b，b=0 时按 IEEE 传播 Inf/NaN。");

    // fma 与余数、幂指数
    case "fma": return tail("fma(a,b,c): 近似 IEEE754 单条 FMA 语义，先在双精度算 a*b+c 后一次写回 Float32。");
    case "fmod": return tail("fmod(a,b): C 风格余数 a - trunc(a/b)*b；b≠0；符号随 a。");
    case "pow": return tail("pow(a,b): 幂运算，0^0 与负数的非整数幂会产生 NaN；结果收敛到 Float32。");
    case "ldexp": return tail("ldexp(a,exp): 计算 a * 2^exp；exp 按整数解析。");

    // 一元非线性
    case "sqrt": return tail("sqrt(a): 平方根；定义域 a≥0；a<0 产生 NaN。");
    case "rsqrt": return tail("rsqrt(a): 1/sqrt(a)；定义域 a≥0；a=0 返回 +Inf。");
    case "log": return tail("log(a): 自然对数 ln(a)；定义域 a>0；a≤0 产生 NaN 或 -Inf。");
    case "log2": return tail("log2(a): 以 2 为底对数；定义域 a>0；a≤0 产生 NaN 或 -Inf。");
    case "log1p": return tail("log1p(a): ln(1+a)；对 a≈0 更稳定；a≤-1 产生 NaN 或 -Inf。");
    case "exp": return tail("exp(a): e^a；可能溢出为 +Inf。");
    case "exp10": return tail("exp10(a): 10^a；通过 e^(a*ln10) 实现，Float32 收敛。");
    case "expm1": return tail("expm1(a): e^a - 1；对 a≈0 更稳定。");

    // 三角与双曲
    case "sin": return tail("sin(a): 正弦，输入为弧度；结果落位到 Float32。");
    case "cos": return tail("cos(a): 余弦，弧度制；Float32 收敛。");
    case "tan": return tail("tan(a): 正切，接近 π/2+kπ 时可能发散为 ±Inf。");
    case "sinpi": return tail("sinpi(a): 计算 sin(π·a)；整数点理论 0，靠近整数时数值更稳定。");
    case "cospi": return tail("cospi(a): 计算 cos(π·a)；半整数点理论 0，靠近半整数时更稳定。");
    case "sec": return tail("sec(a)=1/cos(a): 正割；cos(a)=0 的奇点处发散。");
    case "csc": return tail("csc(a)=1/sin(a): 余割；sin(a)=0 的奇点处发散。");
    case "cot": return tail("cot(a)=1/tan(a): 余切；tan(a)=0 的奇点处发散。");
    case "asin": return tail("asin(a): 反正弦，返回区间 [-π/2, π/2]，定义域 a∈[-1,1]。");
    case "acos": return tail("acos(a): 反余弦，返回区间 [0, π]，定义域 a∈[-1,1]。");
    case "atan": return tail("atan(a): 反正切，返回区间 (-π/2, π/2)。");
    case "atan2": return tail("atan2(y,x): 以 (x,y) 的象限确定角度，返回 (-π, π]；支持 x=0。");
    case "sinh": return tail("sinh(a): 双曲正弦；大幅值可能溢出。");
    case "cosh": return tail("cosh(a): 双曲余弦；非负，可能溢出。");
    case "tanh": return tail("tanh(a): 双曲正切；|a|→∞ 时趋近 ±1。");
    case "asinh": return tail("asinh(a): 反双曲正弦，定义域全体实数。");
    case "acosh": return tail("acosh(a): 反双曲余弦，定义域 a≥1。");
    case "atanh": return tail("atanh(a): 反双曲正切，定义域 |a|<1，a→±1 时发散。");
    case "sincos": return tail("sincos(a): 同时返回 sin 与 cos，避免重复求值误差。");

    // 特殊函数
    case "lgamma": return tail("lgamma(a): ln|Gamma(a)|，对非正整数存在极点返回 +Inf，含反射公式处理。");
    case "tgamma": return tail("gamma(a)=Γ(a): Gamma 函数本身；a≥0.5 直接 exp(lgamma(a))，a<0.5 走反射 Γ(a)=π/(sin(πa)·Γ(1−a))；非正整数极点返回 +Inf。");
    case "erf": return tail("erf(a): 误差函数，范围约在 (-1,1)，采用经典近似，Float32 精度目标。");
    case "j0": return tail("j0(a): 第一类贝塞尔函数 J0，分段近似（小 x 有理逼近/大 x 渐近）。");
    case "j1": return tail("j1(a): 第一类贝塞尔函数 J1，分段近似。");
    case "y0": return tail("y0(a): 第二类贝塞尔函数 Y0，定义域 a>0，a≤0 发散为 -Inf；小 x 使用近似，多段逼近。");
    case "y1": return tail("y1(a): 第二类贝塞尔函数 Y1，定义域 a>0，x≤0 发散。");
    case "i0": return tail("i0(a): 修正贝塞尔 I0，分段近似，|a| 大时使用渐近。");
    case "i1": return tail("i1(a): 修正贝塞尔 I1，分段近似，符号与 a 一致。");

    // IEEE-754 常用实用函数
    case "abs": return tail("abs(a): 绝对值，按位清除符号位，保留 NaN 的位型。");
    case "copysign": return tail("copysign(a,b): 将 a 的数值与 b 的符号合并；不改变 a 的幅值。");
    case "fdim": return tail("fdim(a,b): 若 a>b 返回 a-b，否则返回 +0；NaN 传播。");
    case "fmax": return tail("fmax(a,b): 返回较大者；若一方 NaN 返回另一个；两者皆 NaN 返回 NaN。");
    case "fmin": return tail("fmin(a,b): 返回较小者；NaN 规则同 fmax。");
    case "hypot": return tail("hypot(a,b): 计算 sqrt(a^2+b^2)，缩放避免溢出/下溢，更稳定。");
    case "trunc": return tail("trunc(a): 朝 0 方向取整。");
    case "floor": return tail("floor(a): 向下取整（不大于 a 的最大整数）。");
    case "ceil": return tail("ceil(a): 向上取整（不小于 a 的最小整数）。");
    case "round": return tail("round(a): 四舍五入到最接近整数（0.5 向远离 0）。");
    case "rint": return tail("rint(a): 银行家舍入到最近整数（ties-to-even）。");
    case "modf": return tail("modf(a): 分解为小数部分与整数部分，返回 {frac,int}，满足 a=int+frac。");
    case "frexp": return tail("frexp(a): 返回 {mant,exp}，使 a=mant*2^exp，mant∈[0.5,1) 或为 0。");
    case "ilogb": return tail("ilogb(a): 返回以 2 为底的指数（整型语义），0→FP_ILOGB0，NaN/Inf→FP_ILOGB_NAN。");
    case "logb": return tail("logb(a): 返回以 2 为底的指数（浮点语义），0→-Inf，NaN/Inf→+Inf。");
    case "scalbn": return tail("scalbn(a,exp): 计算 a*2^exp，等价于快速缩放。");
    case "scalbln": return tail("scalbln(a,exp): 同 scalbn，接受长整型语义的 exp（实现中均为整数）。");
    case "nextafter": return tail("nextafter(a,b): 返回从 a 朝向 b 的下一个可表示值；在类型为 float32/float64 下分别工作，含 ±0 的最小步进。");
    case "isnan": return tail("isnan(a): 若 a 为 NaN 返回 1，否则返回 0；输入 NaN/Inf 允许。");
    case "isinf": return tail("isinf(a): 若 a 为 ±Infinity 返回 1，否则返回 0；输入 NaN/Inf 允许。");
    case "isfinite": return tail("isfinite(a): 若有限返回 1，否则 0（含 NaN/Inf）。");
    case "signbit": return tail("signbit(a): 返回符号位（-0 的符号位为 1），结果为 0 或 1。");

    default: return hexTip;
  }
}

function domainCheckUnary(key, a) {
  // 允许在 f64 模式下的域检查直接沿用数值判断
  // 对于 isnan/isinf/isfinite/signbit 这类判定函数，应允许 NaN/Inf 作为合法输入
  if (key === "isnan" || key === "isinf" || key === "isfinite" || key === "signbit") {
    return;
  }
  // 其余一元函数：仅当需要做定义域限制时检查；否则允许 NaN/Inf 传递到实现层自行处理/传播
  if (!isFiniteNumber(a)) return;

  if (key === "log" || key === "log2") {
    if (!(a > 0)) throw new Error("定义域错误：要求 a > 0");
  }
  if (key === "rsqrt" || key === "sqrt") {
    if (a < 0) throw new Error("定义域错误：要求 a ≥ 0");
  }
  if (key === "y1") {
    if (!(a > 0)) throw new Error("定义域错误：要求 a > 0");
  }
}

function domainCheckBinary(key, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    // 允许 NaN/Inf 直接进入下游，由结果展示 NaN/Inf；不在这里拦截为“输入无效”
    return;
  }
  if (key === "div" || key === "fmod") {
    if (b === 0) throw new Error("定义域错误：除数/模数 b ≠ 0");
  }
}

// 示例填充
function fillExamples() {
  const key = document.getElementById("func").value;
  function setDecHex(prefix, decVal){
    const dec = document.getElementById(`${prefix}-dec`);
    const hex = document.getElementById(`${prefix}-hex`);
    if (dec) dec.value = String(decVal);
    if (hex) {
      const t = getNumericType();
      if (t==="f64"){
        const parsed = f64(Number(decVal));
        hex.value = bitsF64(parsed);
      } else {
        const parsed = f32(Number(decVal));
        hex.value = bitsF32(parsed);
      }
    }
  }
  function setExp(v){ const el=document.getElementById("arg-exp"); if (el) el.value=String(v); }

  switch(key){
    // 新增函数的示例（部分）
    case "sin": setDecHex("arg-a","0.5"); break;
    case "cos": setDecHex("arg-a","0.5"); break;
    case "tan": setDecHex("arg-a","0.5"); break;
    case "sinpi": setDecHex("arg-a","0.5"); break;  // ≈ 1
    case "cospi": setDecHex("arg-a","1.0"); break;  // ≈ -1
    case "sec": setDecHex("arg-a","0.5"); break;
    case "csc": setDecHex("arg-a","0.5"); break;
    case "cot": setDecHex("arg-a","0.5"); break;
    case "asin": setDecHex("arg-a","0.5"); break;
    case "acos": setDecHex("arg-a","0.5"); break;
    case "atan": setDecHex("arg-a","1"); break;
    case "atan2": setDecHex("arg-a","1"); setDecHex("arg-b","1"); break;
    case "asinh": setDecHex("arg-a","1.25"); break;
    case "acosh": setDecHex("arg-a","1.25"); break;
    case "atanh": setDecHex("arg-a","0.5"); break;

    case "abs": setDecHex("arg-a","-3.5"); break;
    case "copysign": setDecHex("arg-a","-1.25"); setDecHex("arg-b","2.5"); break;
    case "fdim": setDecHex("arg-a","4.5"); setDecHex("arg-b","3.0"); break;
    case "fmax": setDecHex("arg-a","-2"); setDecHex("arg-b","3"); break;
    case "fmin": setDecHex("arg-a","-2"); setDecHex("arg-b","3"); break;
    case "hypot": setDecHex("arg-a","3"); setDecHex("arg-b","4"); break;
    case "trunc": setDecHex("arg-a","-3.75"); break;
    case "floor": setDecHex("arg-a","-3.25"); break;
    case "ceil": setDecHex("arg-a","-3.25"); break;
    case "round": setDecHex("arg-a","2.5"); break;
    case "rint": setDecHex("arg-a","2.5"); break;
    case "modf": setDecHex("arg-a","-3.75"); break;
    case "frexp": setDecHex("arg-a","6.5"); break;
    case "ilogb": setDecHex("arg-a","6.5"); break;
    case "logb": setDecHex("arg-a","6.5"); break;
    case "scalbn": setDecHex("arg-a","0.8125"); setExp("4"); break;
    case "scalbln": setDecHex("arg-a","0.8125"); setExp("4"); break;
    case "nextafter": setDecHex("arg-a","1"); setDecHex("arg-b","2"); break;
    case "isnan": setDecHex("arg-a","NaN"); break;
    case "isinf": setDecHex("arg-a","Infinity"); break;
    case "isfinite": setDecHex("arg-a","123.5"); break;
    case "signbit": setDecHex("arg-a","-0"); break;
    case "add": setDecHex("arg-a","1.25"); setDecHex("arg-b","2.5"); break;
    case "sub": setDecHex("arg-a","5"); setDecHex("arg-b","2.75"); break;
    case "mul": setDecHex("arg-a","3.5"); setDecHex("arg-b","2"); break;
    case "div": setDecHex("arg-a","7"); setDecHex("arg-b","3"); break;
    case "fma": setDecHex("arg-a","1.25"); setDecHex("arg-b","2.5"); setDecHex("arg-c","-0.5"); break;
    case "sqrt": setDecHex("arg-a","9"); break;
    case "rsqrt": setDecHex("arg-a","4"); break;
    case "ldexp": setDecHex("arg-a","0.15625"); setExp("3"); break;
    case "pow": setDecHex("arg-a","2"); setDecHex("arg-b","10"); break;
    case "log": setDecHex("arg-a","2.5"); break;
    case "log2": setDecHex("arg-a","8"); break;
    case "log1p": setDecHex("arg-a","0.25"); break;
    case "exp": setDecHex("arg-a","1"); break;
    case "exp10": setDecHex("arg-a","2"); break;
    case "expm1": setDecHex("arg-a","1e-3"); break;
    case "fmod": setDecHex("arg-a","7.5"); setDecHex("arg-b","2"); break;
    case "lgamma": setDecHex("arg-a","3.5"); break;
    case "tgamma": setDecHex("arg-a","0.5"); break;
    case "erf": setDecHex("arg-a","1.2"); break;
    case "erfc": setDecHex("arg-a","1.2"); break;
    case "erfcx": setDecHex("arg-a","1.2"); break;
    case "erfcinv": setDecHex("arg-a","0.5"); break;
    case "normcdfinv": setDecHex("arg-a","0.8413447461"); break;
    case "sinh": setDecHex("arg-a","1.25"); break;
    case "cosh": setDecHex("arg-a","1.25"); break;
    case "tanh": setDecHex("arg-a","0.75"); break;
    case "y0": setDecHex("arg-a","1.0"); break;
    case "y1": setDecHex("arg-a","1.0"); break;
    case "sincos": setDecHex("arg-a","0.5"); break;
    case "j0": setDecHex("arg-a","0.5"); break;
    case "j1": setDecHex("arg-a","0.5"); break;
    case "i0": setDecHex("arg-a","0.5"); break;
    case "i1": setDecHex("arg-a","0.5"); break;
  }
}

// 内置测试
function initTests() {
  // 分组折叠 + 顶部搜索（状态记忆）的“函数速选面板”
  const grid = document.getElementById("test-buttons");
  const log = document.getElementById("test-log");
  if (!grid) return;

  grid.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "quick-panel-wrap";

  // 搜索框与本地存储键
  const searchBox = document.createElement("input");
  searchBox.type = "search";
  searchBox.placeholder = "搜索函数（按 name 或 key 过滤）";
  searchBox.className = "quick-search";
  const LS_KEY = "quickPanel.search";
  const LS_COLLAPSE = "quickPanel.collapse";
  const savedQuery = localStorage.getItem(LS_KEY) || "";
  searchBox.value = savedQuery;

  // 分组定义（用户指定）
  const groups = [
    { id: "basic",      title: "基础运算", match: (k) => ["add","sub","mul","div","fma","fmod","pow","ldexp"].includes(k) },
    { id: "exp-log",    title: "指数对数", match: (k) => ["sqrt","rsqrt","log","log2","log1p","exp","exp10","expm1"].includes(k) },
    { id: "trig",       title: "三角/双曲", match: (k) => ["sin","cos","tan","sinpi","cospi","sinh","cosh","tanh","sincos"].includes(k) },
    { id: "inv-trig",   title: "反三角/反双曲", match: (k) => ["asin","acos","atan","atan2","asinh","acosh","atanh"].includes(k) },
    { id: "recip-trig", title: "倒数三角", match: (k) => ["sec","csc","cot"].includes(k) },
    { id: "special",    title: "误差函数/正态", match: (k) => ["erf","erfc","erfcx","erfcinv","normcdfinv"].includes(k) },
    { id: "bessel",     title: "Bessel/特殊函数", match: (k) => ["lgamma","tgamma","j0","j1","y0","y1","i0","i1"].includes(k) },
    { id: "ieee",       title: "IEEE-754实用", match: (k) => ["abs","copysign","fdim","fmax","fmin","hypot","trunc","floor","ceil","round","rint","modf","frexp","ilogb","logb","scalbn","scalbln","nextafter","isnan","isinf","isfinite","signbit"].includes(k) },
  ];
  // 兜底组：未匹配到的函数
  const unmatched = FunctionMeta.filter(m => !groups.some(g => g.match(m.key)));
  if (unmatched.length) {
    groups.push({ id: "others", title: "其它", match: (k) => unmatched.some(m => m.key === k) });
  }

  // 折叠状态恢复
  let collapseState = {};
  try { collapseState = JSON.parse(localStorage.getItem(LS_COLLAPSE) || "{}"); } catch {}

  const panel = document.createElement("div");
  panel.className = "quick-groups";

  function buildGroups(filterText) {
    panel.innerHTML = "";
    const q = (filterText || "").trim().toLowerCase();

    groups.forEach(group => {
      // 获取分组内条目
      let items = FunctionMeta.filter(m => group.match(m.key));
      // 搜索过滤（按 name 或 key）
      if (q) {
        items = items.filter(m => (m.name || "").toLowerCase().includes(q) || (m.key || "").toLowerCase().includes(q));
      }

      // 若当前搜索条件下该分组匹配条目数为 0，则完全隐藏该分组（不渲染）
      if (items.length === 0) return;

      const box = document.createElement("div");
      box.className = "quick-group";

      const header = document.createElement("div");
      header.className = "quick-group-header";
      header.textContent = group.title;

      const countSpan = document.createElement("span");
      countSpan.className = "quick-count";
      countSpan.textContent = ` (${items.length})`;
      header.appendChild(countSpan);

      const body = document.createElement("div");
      body.className = "quick-group-body";

      // 生成按钮
      items.forEach(m => {
        const btn = document.createElement("button");
        btn.className = "quick-btn";
        btn.textContent = m.name;
        btn.title = m.key;
        btn.addEventListener("click", () => {
          const sel = document.getElementById("func");
          if (sel) {
            sel.value = m.key;
            syncInputs();
            fillExamples();
            if (log) log.textContent = `[select] ${m.key} => 已切换并填充示例`;
          }
        });
        body.appendChild(btn);
      });

      // 应用折叠状态（默认展开）
      const collapsed = !!collapseState[group.id];
      if (collapsed) body.style.display = "none";

      header.addEventListener("click", () => {
        const isHidden = body.style.display === "none";
        body.style.display = isHidden ? "" : "none";
        collapseState[group.id] = !isHidden;
        try { localStorage.setItem(LS_COLLAPSE, JSON.stringify(collapseState)); } catch {}
      });

      box.appendChild(header);
      box.appendChild(body);
      panel.appendChild(box);
    });
  }

  // 初次渲染
  buildGroups(savedQuery);

  // 搜索联动 + 状态记忆
  searchBox.addEventListener("input", () => {
    const v = searchBox.value || "";
    try { localStorage.setItem(LS_KEY, v); } catch {}
    buildGroups(v);
  });

  wrap.appendChild(searchBox);
  wrap.appendChild(panel);
  grid.appendChild(wrap);

  if (log && !log.textContent) {
    log.textContent = "已加载分组速选面板（可折叠，支持搜索，状态已持久化）。";
  }
}

// 初始化
window.addEventListener("DOMContentLoaded", initUI);

// ===== 历史运算记录（追加在文件末尾，导出到 window 命名空间） =====
(function attachHistory(){
  function readCurrentInputsSnapshot(key){
    function pickArg(prefix){
      const dec = document.getElementById(`${prefix}-dec`);
      const hex = document.getElementById(`${prefix}-hex`);
      const decVal = dec ? (dec.value || "").trim() : "";
      const hexVal = hex ? (hex.value || "").trim() : "";
      let val = NaN;
      const t = getNumericType();
      if (decVal !== "") {
        if (/^(nan)$/i.test(decVal)) val = t==="f64" ? f64(NaN) : f32(NaN);
        else if (/^[+-]?inf(inity)?$/i.test(decVal)) val = t==="f64" ? f64(decVal[0] === '-' ? -Infinity : Infinity) : f32(decVal[0] === '-' ? -Infinity : Infinity);
        else {
          const n = Number(decVal);
          val = Number.isNaN(n) ? NaN : (t==="f64" ? f64(n) : f32(n));
        }
      } else if (hexVal !== "") {
        val = t==="f64" ? parseF64Input(hexVal) : parseF32Input(hexVal);
      }
      const vhex = t==="f64" ? bitsF64(val) : bitsF32(val);
      return {
        dec: decVal,
        hex: hexVal,
        value: val,
        valueHex: vhex
      };
    }

    const meta = FunctionMeta.find(m => m.key === key) || { args: [] };
    const snap = {};
    meta.args.forEach(a => {
      if (a === "exp") {
        const v = document.getElementById("arg-exp");
        snap.exp = v ? (v.value || "").trim() : "";
      } else {
        if (a === "a") snap.a = pickArg("arg-a");
        else if (a === "b") snap.b = pickArg("arg-b");
        else if (a === "c") snap.c = pickArg("arg-c");
      }
    });
    return snap;
  }

  function appendHistory(entry){
    const log = document.getElementById("history-log");
    if (!log) return;

    const ts = new Date().toISOString().replace("T"," ").replace("Z","");
    const key = entry.key;
    const rmode = (typeof getRoundingMode==="function") ? getRoundingMode() : "RN";
    const ntype = (typeof getNumericType==="function") ? getNumericType() : "f32";

    function fmtArg(argObj){
      if (!argObj) return "";
      const d = argObj.dec || "";
      const h = argObj.hex || "";
      const vx = argObj.value;
      const vdec = Number.isFinite(vx) ? decStr(vx) : String(vx);
      const vhex = ntype==="f64" ? bitsF64(vx) : bitsF32(vx);
      return `dec=${d||"∅"}, hex=${h||"∅"} -> v=${vdec} (${vhex})`;
    }

    let inputStr = "";
    const meta = FunctionMeta.find(m => m.key === key) || { args: [] };
    meta.args.forEach(a => {
      if (a === "exp") {
        inputStr += ` ${a}=${entry.inputs.exp ?? ""};`;
      } else if (a === "a" || a === "b" || a === "c") {
        inputStr += ` ${a}{ ${fmtArg(entry.inputs[a])} };`;
      }
    });

    let line;
    if ("error" in entry) {
      line = `[${ts}] ${key} [type=${ntype.toUpperCase()}, mode=${rmode}] |${inputStr} => ERROR: ${entry.error}\n`;
    } else {
      const y = ntype==="f64" ? f64(entry.result) : f32(entry.result);
      // 确保历史记录中的 f64 十六进制不经由 f32 通道
      const yhex = ntype==="f64" ? bitsF64(y) : bitsF32(y);
      // 追加一个可见的调试行，便于确认 f64 的完整 16 位十六进制尾数未被截断
      // 隐藏 f64 额外调试行
      line = `[${ts}] ${key} [type=${ntype.toUpperCase()}, mode=${rmode}] |${inputStr} => y=${decStr(y)} | ${sciStr(y)} | ${yhex}\n`;
    }

    log.textContent = line + log.textContent;
  }

  // 挂到 window，供 onCalc 安全调用
  window.readCurrentInputsSnapshot = readCurrentInputsSnapshot;
  window.appendHistory = appendHistory;
})();