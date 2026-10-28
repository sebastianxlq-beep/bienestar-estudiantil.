'use strict';
// Ejecutar con: npm test   (no necesita base de datos)
process.env.DATABASE_URL = 'postgres://x';
process.env.SESSION_SECRET = 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const u = require('../src/util');
const { detectColumns, gradoSeccion, nn } = require('../src/excelmap');

test('parseMoney entiende formatos de colones', () => {
  assert.strictEqual(u.parseMoney('45000'), 45000);
  assert.strictEqual(u.parseMoney('₡45.000'), 45000);
  assert.strictEqual(u.parseMoney('45,000'), 45000);
  assert.strictEqual(u.parseMoney('45.000,50'), 45000.5);
  assert.strictEqual(u.parseMoney('1,234,567.89'), 1234567.89);
  assert.strictEqual(u.parseMoney('12,5'), 12.5);
  assert.strictEqual(u.parseMoney(30000), 30000);
  assert.ok(Number.isNaN(u.parseMoney('abc')));
  assert.ok(Number.isNaN(u.parseMoney('-500')));
});

test('moneyOrNull rechaza cero, negativos y absurdos', () => {
  assert.strictEqual(u.moneyOrNull(0), null);
  assert.strictEqual(u.moneyOrNull(-1), null);
  assert.strictEqual(u.moneyOrNull('x'), null);
  assert.strictEqual(u.moneyOrNull(1e15), null);
  assert.strictEqual(u.moneyOrNull('10.456'), 10456); // 10.456 = diez mil cuatrocientos (formato tico)
  assert.strictEqual(u.moneyOrNull(10.456), 10.46);
});

test('estado y saldo', () => {
  assert.strictEqual(u.estadoDe(0, 0), 'sc');
  assert.strictEqual(u.estadoDe(100, 40), 'pe');
  assert.strictEqual(u.estadoDe(100, 100), 'pa');
  assert.strictEqual(u.estadoDe(100, 150), 'fa');
  assert.strictEqual(u.estadoDe(0.1 + 0.2, 0.3), 'pa'); // sin errores de coma flotante
});

test('validaciones', () => {
  assert.ok(u.validCedula('123456789'));
  assert.ok(!u.validCedula('12345'));
  assert.ok(!u.validCedula('12345678901234'));
  assert.ok(u.validEmail('maria.rojas@correo.com'));
  assert.ok(!u.validEmail('maria@correo'));
  assert.ok(!u.validEmail('a b@c.com'));
  assert.ok(u.passwordError('corta'));
  assert.strictEqual(u.passwordError('suficientemente-larga'), null);
  assert.ok(u.passwordError('x'.repeat(80)));
  assert.ok(u.validDate('2026-02-28'));
  assert.ok(!u.validDate('2026-02-30'));
  assert.ok(!u.validDate('26-1-1'));
  assert.ok(u.validGradoSeccion(7, 1));
  assert.ok(!u.validGradoSeccion(6, 1));
  assert.ok(!u.validGradoSeccion(12, 9));
});

test('clean elimina caracteres de control (evita inyección de cabeceras de correo)', () => {
  assert.strictEqual(u.clean('Hola\r\nBcc: x@y.com'), 'Hola Bcc: x@y.com');
});

test('permisos: el profe queda limitado a su grado y sección en SQL', () => {
  const p = [];
  const sql = u.scopeSql({ rol: 'profe', grado: 8, seccion: 2 }, p);
  assert.deepStrictEqual(p, [8, 2]);
  assert.match(sql, /e\.grado = \$1 AND e\.seccion = \$2/);
  const p2 = [];
  assert.strictEqual(u.scopeSql({ rol: 'admin' }, p2), 'TRUE');
  assert.deepStrictEqual(p2, []);
});

test('detección de columnas del Excel (plantilla)', () => {
  const m = detectColumns(['Nombre del estudiante', 'Cédula del estudiante', 'Grado', 'Sección', 'Nombre del encargado', 'Correo del encargado', 'Teléfono (opcional)', 'Monto adeudado (₡)', 'Concepto']);
  assert.deepStrictEqual(m, { cedula: 1, correo: 5, telefono: 6, encargado: 4, nombre: 0, grado: 2, seccion: 3, monto: 7, concepto: 8 });
});

test('detección de columnas con títulos distintos y con cédula del encargado', () => {
  const m = detectColumns(['Alumno', 'Identificación', 'Cédula del encargado', 'Padre/Madre', 'Email', 'Celular', 'Sección']);
  assert.strictEqual(m.nombre, 0); assert.strictEqual(m.cedula, 1); assert.strictEqual(m.encargado, 3);
  assert.strictEqual(m.correo, 4); assert.strictEqual(m.telefono, 5); assert.strictEqual(m.seccion, 6);
});

test('grado y sección desde "7-1", "Sétimo"+1, "12/4"', () => {
  assert.deepStrictEqual(gradoSeccion('', '7-1', 4), [7, 1]);
  assert.deepStrictEqual(gradoSeccion('Sétimo', '2', 4), [7, 2]);
  assert.deepStrictEqual(gradoSeccion(9, '9-3', 4), [9, 3]);
  assert.deepStrictEqual(gradoSeccion('12', '12/4', 4), [12, 4]);
  assert.strictEqual(gradoSeccion('13', '13-1', 4), null);
  assert.strictEqual(gradoSeccion('7', '7-9', 4), null);
  assert.strictEqual(nn('Cédula'), 'cedula');
});
