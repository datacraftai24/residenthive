-- Summary of all LLM decisions
SELECT 
    agent_name,
    decision_type,
    COUNT(*) as count,
    AVG(confidence::numeric) as avg_confidence
FROM llm_decisions
GROUP BY agent_name, decision_type
ORDER BY count DESC;

-- Top scoring strategies
SELECT 
    strategy_name,
    strategy_type,
    COUNT(*) as times_evaluated,
    AVG(overall_score) as avg_score,
    MAX(overall_score) as max_score,
    SUM(CASE WHEN is_feasible THEN 1 ELSE 0 END) as times_feasible
FROM investment_strategy_scores
GROUP BY strategy_name, strategy_type
ORDER BY avg_score DESC
LIMIT 15;

-- Property analysis success rate
SELECT 
    strategy_type,
    COUNT(*) as total_evaluations,
    AVG(overall_score) as avg_score,
    SUM(CASE WHEN overall_score >= 60 THEN 1 ELSE 0 END) as viable_count,
    ROUND(100.0 * SUM(CASE WHEN overall_score >= 60 THEN 1 ELSE 0 END) / COUNT(*), 2) as viability_rate
FROM investment_strategy_scores
GROUP BY strategy_type
ORDER BY avg_score DESC;

-- Session analysis
SELECT 
    COUNT(DISTINCT session_id) as total_sessions,
    COUNT(*) as total_decisions,
    AVG(confidence::numeric) as avg_confidence,
    MIN(created_at) as first_decision,
    MAX(created_at) as last_decision
FROM llm_decisions;

-- Decision confidence distribution
SELECT 
    CASE 
        WHEN confidence::numeric >= 0.9 THEN 'Very High (90-100%)'
        WHEN confidence::numeric >= 0.8 THEN 'High (80-89%)'
        WHEN confidence::numeric >= 0.7 THEN 'Good (70-79%)'
        WHEN confidence::numeric >= 0.6 THEN 'Moderate (60-69%)'
        ELSE 'Low (<60%)'
    END as confidence_level,
    COUNT(*) as count,
    ROUND(AVG(confidence::numeric) * 100, 1) as avg_confidence_pct
FROM llm_decisions
GROUP BY confidence_level
ORDER BY avg_confidence_pct DESC;
