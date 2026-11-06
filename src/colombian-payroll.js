const RULES_2026 = Object.freeze({
  minimumMonthlySalary: 1_750_905,
  transportAllowance: 249_095,
  transportLimitMinimumWages: 2,
  contributionMaximumMinimumWages: 25,
  healthEmployeeRate: 0.04,
  healthEmployerRate: 0.085,
  pensionEmployeeRate: 0.04,
  pensionEmployerRate: 0.12,
  familyCompensationRate: 0.04,
  senaRate: 0.02,
  icbfRate: 0.03,
  nightPremiumRate: 0.35,
  overtimeDayRate: 1.25,
  overtimeNightRate: 1.75,
  cesantiasRate: 1 / 12,
  primaRate: 1 / 12,
  cesantiasInterestAnnualRate: 0.12,
  vacationRate: 1 / 24
});

const money = (value, label) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} debe ser un valor igual o mayor que cero.`);
  return amount;
};

const cop = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const yes = (value) => [true, "Sí", "Si", "true", "yes"].includes(value);

function solidarityRate(ibc, minimum) {
  const incomeInMinimums = ibc / minimum;
  if (incomeInMinimums < 4) return 0;
  if (incomeInMinimums < 16) return 0.01;
  if (incomeInMinimums < 17) return 0.012;
  if (incomeInMinimums < 18) return 0.014;
  if (incomeInMinimums < 19) return 0.016;
  if (incomeInMinimums < 20) return 0.018;
  return 0.02;
}

function weeklyHoursForPeriod(period) {
  if (period < "2026-07") return 44;
  if (period === "2026-07") return 43;
  return 42;
}

export function calculateColombianPayroll({
  employee, period, daysWorked = 30, nightHours = 0,
  overtimeDayHours = 0, overtimeNightHours = 0,
  restDayDayHours = 0, restDayNightHours = 0,
  overtimeRestDayDayHours = 0, overtimeRestDayNightHours = 0,
  additionalSalary = 0, otherDeductions = 0, incomeTaxWithholding = 0
}) {
  if (!employee?.id) throw new Error("Selecciona un empleado.");
  if (!/^2026-(0[1-9]|1[0-2])$/.test(String(period || ""))) {
    throw new Error("La tabla normativa configurada cubre periodos de nómina de 2026. No liquides otros años con estos parámetros.");
  }
  const salary = money(employee.salary, "El salario mensual pactado");
  if (salary <= 0) throw new Error("El empleado debe tener un salario mensual mayor que cero.");
  const days = money(daysWorked, "Los días laborados");
  if (days <= 0 || days > 30) throw new Error("Los días laborados deben estar entre 1 y 30.");

  const hours = {
    night: money(nightHours, "Las horas nocturnas"),
    overtimeDay: money(overtimeDayHours, "Las horas extra diurnas"),
    overtimeNight: money(overtimeNightHours, "Las horas extra nocturnas"),
    restDayDay: money(restDayDayHours, "Las horas de día de descanso"),
    restDayNight: money(restDayNightHours, "Las horas nocturnas en descanso"),
    overtimeRestDayDay: money(overtimeRestDayDayHours, "Las horas extra diurnas en descanso"),
    overtimeRestDayNight: money(overtimeRestDayNightHours, "Las horas extra nocturnas en descanso")
  };
  const overtimeHours = hours.overtimeDay + hours.overtimeNight + hours.overtimeRestDayDay + hours.overtimeRestDayNight;
  const weeklyOvertimeLimit = 12 * Math.ceil(days / 7);
  if (overtimeHours > weeklyOvertimeLimit || overtimeHours > 2 * days) {
    throw new Error("Las horas extra registradas superan el límite agregado de referencia. Verifica también que no excedan 2 horas diarias ni 12 semanales.");
  }

  const rules = RULES_2026;
  const weeklyHours = weeklyHoursForPeriod(period);
  const hourlyRate = salary / (weeklyHours * 5);
  const restDayPremiumRate = period >= "2026-07" ? 0.9 : 0.8;
  const baseSalary = cop(salary * days / 30);
  const additions = cop(money(additionalSalary, "Otros devengados salariales")
    + hours.night * hourlyRate * rules.nightPremiumRate
    + hours.overtimeDay * hourlyRate * rules.overtimeDayRate
    + hours.overtimeNight * hourlyRate * rules.overtimeNightRate
    + hours.restDayDay * hourlyRate * restDayPremiumRate
    + hours.restDayNight * hourlyRate * (restDayPremiumRate + rules.nightPremiumRate)
    + hours.overtimeRestDayDay * hourlyRate * (rules.overtimeDayRate + restDayPremiumRate)
    + hours.overtimeRestDayNight * hourlyRate * (rules.overtimeNightRate + restDayPremiumRate + rules.nightPremiumRate));
  const salaryEarnings = cop(baseSalary + additions);
  const transportEligible = yes(employee.transportEligible)
    && salaryEarnings <= rules.minimumMonthlySalary * rules.transportLimitMinimumWages;
  const transportAllowance = transportEligible ? cop(rules.transportAllowance * days / 30) : 0;

  const minimumContributionBase = rules.minimumMonthlySalary * days / 30;
  const ibc = cop(Math.min(
    Math.max(salaryEarnings, minimumContributionBase),
    rules.minimumMonthlySalary * rules.contributionMaximumMinimumWages
  ));
  const employerExonerated = yes(employee.employerExonerated)
    && ibc < rules.minimumMonthlySalary * 10;
  const arlRate = money(employee.arlRate ?? 0.522, "La tarifa de ARL") / 100;

  const deductions = {
    health: cop(ibc * rules.healthEmployeeRate),
    pension: cop(ibc * rules.pensionEmployeeRate),
    solidarityFund: cop(ibc * solidarityRate(ibc, rules.minimumMonthlySalary)),
    other: cop(money(otherDeductions, "Otras deducciones autorizadas")),
    incomeTaxWithholding: cop(money(incomeTaxWithholding, "La retención en la fuente"))
  };
  const totalDeductions = cop(Object.values(deductions).reduce((sum, amount) => sum + amount, 0));
  const grossPay = cop(salaryEarnings + transportAllowance);
  if (totalDeductions > grossPay) throw new Error("Las deducciones superan el total devengado.");
  const netPay = cop(grossPay - totalDeductions);

  const employerContributions = {
    health: employerExonerated ? 0 : cop(ibc * rules.healthEmployerRate),
    pension: cop(ibc * rules.pensionEmployerRate),
    arl: cop(ibc * arlRate),
    familyCompensation: cop(ibc * rules.familyCompensationRate),
    sena: employerExonerated ? 0 : cop(ibc * rules.senaRate),
    icbf: employerExonerated ? 0 : cop(ibc * rules.icbfRate)
  };
  const totalEmployerContributions = cop(Object.values(employerContributions).reduce((sum, amount) => sum + amount, 0));
  const benefitBase = cop(salaryEarnings + transportAllowance);
  const provisions = {
    prima: cop(benefitBase * rules.primaRate),
    cesantias: cop(benefitBase * rules.cesantiasRate),
    cesantiasInterest: cop(salaryEarnings * rules.cesantiasInterestAnnualRate / 12),
    vacation: cop(salaryEarnings * rules.vacationRate)
  };
  const totalProvisions = cop(Object.values(provisions).reduce((sum, amount) => sum + amount, 0));
  const totalEmployerCost = cop(grossPay + totalEmployerContributions + totalProvisions);

  return {
    period, daysWorked: days, weeklyHours, hourlyRate: cop(hourlyRate), restDayPremiumRate,
    salary, baseSalary, additionalSalary: additions, salaryEarnings, transportAllowance,
    grossPay, ibc, deductions, totalDeductions, netPay,
    employerExonerated, arlRate: arlRate * 100, employerContributions,
    totalEmployerContributions, provisions, totalProvisions, totalEmployerCost,
    overtimeHours, minimumWageWarning: salary < rules.minimumMonthlySalary * days / 30,
    rules: { ...rules }
  };
}
