# Advisor specification

Purpose: analyze a forecast and produce recommendations that are actionable proposals (not commands).

Recommendation object fields (minimum):
- timestamp (ISO)
- durationMs
- component (string)
- action (enum: CHARGE|DISCHARGE|SHIFT|START|DELAY)
- energy_kwh
- reason (machine-readable identifier)
- expectedBenefit (object)
- priority
- confidence

Advisor must consider multiple intervals (look-ahead reasoning) and may create recommendations that span intervals.
