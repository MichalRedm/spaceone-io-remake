# Analysis Datasets & Reports

This directory stores generated telemetry datasets, kinematic simulation runs, benchmark results, and HTML comparison reports produced by scripts in nalysis/experiments/ and nalysis/toolkit/.

## Regeneration
To regenerate any dataset or report, execute the respective experiment script:
\\\ash
python analysis/experiments/01_invariants/bullet_speeds/measure_bullet_speeds.py
python analysis/experiments/02_kinematic_limits/movement_model_comparison.py
python analysis/experiments/03_flocking_physics/generate_flocking_report.py
\\\

Generated \*.json\ and \*.html\ files in this directory are excluded from Git tracking via \.gitignore\ to prevent repository bloat.
