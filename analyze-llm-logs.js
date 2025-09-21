import { db } from './server/db.js';
import { llmDecisions, investmentStrategyScores } from '@shared/schema.js';
import { sql } from 'drizzle-orm';

async function analyzeLogs() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 LLM DECISION LOGGING ANALYSIS');
  console.log('='.repeat(80) + '\n');

  try {
    // 1. Overall Statistics
    const stats = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_decisions,
        AVG(confidence::numeric) as avg_confidence,
        MIN(timestamp) as first_decision,
        MAX(timestamp) as last_decision
      FROM llm_decisions
    `);
    
    console.log('📈 OVERALL STATISTICS:');
    console.log('─'.repeat(40));
    console.log(`Total Sessions: ${stats.rows[0].total_sessions}`);
    console.log(`Total Decisions: ${stats.rows[0].total_decisions}`);
    console.log(`Average Confidence: ${(stats.rows[0].avg_confidence * 100).toFixed(1)}%`);
    console.log(`Time Range: ${new Date(stats.rows[0].first_decision).toLocaleString()} to ${new Date(stats.rows[0].last_decision).toLocaleString()}`);
    
    // 2. Agent Performance
    const agentStats = await db.execute(sql`
      SELECT 
        agent_name,
        decision_type,
        COUNT(*) as count,
        AVG(confidence::numeric) as avg_confidence
      FROM llm_decisions
      GROUP BY agent_name, decision_type
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('\n🤖 TOP AGENT DECISIONS:');
    console.log('─'.repeat(40));
    agentStats.rows.forEach(row => {
      console.log(`${row.agent_name} - ${row.decision_type}: ${row.count} decisions (${(row.avg_confidence * 100).toFixed(1)}% confidence)`);
    });
    
    // 3. Strategy Performance
    const strategyStats = await db.execute(sql`
      SELECT 
        strategy_name,
        strategy_type,
        COUNT(*) as times_evaluated,
        AVG(overall_score) as avg_score,
        MAX(overall_score) as max_score,
        SUM(CASE WHEN is_feasible THEN 1 ELSE 0 END) as times_feasible
      FROM investment_strategy_scores
      GROUP BY strategy_name, strategy_type
      HAVING COUNT(*) > 5
      ORDER BY avg_score DESC
      LIMIT 10
    `);
    
    console.log('\n🏆 TOP PERFORMING STRATEGIES:');
    console.log('─'.repeat(40));
    strategyStats.rows.forEach(row => {
      const feasibilityRate = (row.times_feasible / row.times_evaluated * 100).toFixed(1);
      console.log(`${row.strategy_name} (${row.strategy_type})`);
      console.log(`  Avg Score: ${row.avg_score}/100 | Max: ${row.max_score}/100 | Feasible: ${feasibilityRate}% (${row.times_evaluated} evaluations)`);
    });
    
    // 4. Strategy Type Analysis
    const typeStats = await db.execute(sql`
      SELECT 
        strategy_type,
        COUNT(*) as total_evaluations,
        AVG(overall_score) as avg_score,
        SUM(CASE WHEN overall_score >= 60 THEN 1 ELSE 0 END) as viable_count
      FROM investment_strategy_scores
      GROUP BY strategy_type
      ORDER BY avg_score DESC
    `);
    
    console.log('\n📊 STRATEGY TYPE PERFORMANCE:');
    console.log('─'.repeat(40));
    typeStats.rows.forEach(row => {
      const viabilityRate = (row.viable_count / row.total_evaluations * 100).toFixed(1);
      const avgScore = parseFloat(row.avg_score).toFixed(1);
      console.log(`${row.strategy_type}: ${avgScore}/100 avg score | ${viabilityRate}% viable (${row.total_evaluations} evaluations)`);
    });
    
    // 5. Confidence Distribution
    const confidenceStats = await db.execute(sql`
      SELECT 
        CASE 
          WHEN confidence::numeric >= 0.9 THEN '90-100% (Very High)'
          WHEN confidence::numeric >= 0.8 THEN '80-89% (High)'
          WHEN confidence::numeric >= 0.7 THEN '70-79% (Good)'
          WHEN confidence::numeric >= 0.6 THEN '60-69% (Moderate)'
          ELSE '<60% (Low)'
        END as confidence_level,
        COUNT(*) as count
      FROM llm_decisions
      WHERE confidence IS NOT NULL
      GROUP BY confidence_level
      ORDER BY confidence_level DESC
    `);
    
    console.log('\n🎯 CONFIDENCE DISTRIBUTION:');
    console.log('─'.repeat(40));
    const totalWithConfidence = confidenceStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    confidenceStats.rows.forEach(row => {
      const percentage = (row.count / totalWithConfidence * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(percentage / 2));
      console.log(`${row.confidence_level}: ${bar} ${percentage}% (${row.count} decisions)`);
    });
    
    // 6. Recent Sessions
    const recentSessions = await db.execute(sql`
      SELECT 
        session_id,
        COUNT(*) as decision_count,
        AVG(confidence::numeric) as avg_confidence,
        MAX(timestamp) as last_activity
      FROM llm_decisions
      GROUP BY session_id
      ORDER BY MAX(timestamp) DESC
      LIMIT 5
    `);
    
    console.log('\n🕐 RECENT SESSIONS:');
    console.log('─'.repeat(40));
    recentSessions.rows.forEach(row => {
      const time = new Date(row.last_activity).toLocaleString();
      console.log(`${row.session_id.slice(0, 20)}... - ${row.decision_count} decisions, ${(row.avg_confidence * 100).toFixed(1)}% confidence`);
      console.log(`  Last activity: ${time}`);
    });
    
    // 7. Most Creative Strategies
    const creativeStrategies = await db.execute(sql`
      SELECT DISTINCT
        strategy_name,
        overall_score,
        property_address
      FROM investment_strategy_scores
      WHERE strategy_type = 'ai-custom'
      AND overall_score >= 75
      ORDER BY overall_score DESC
      LIMIT 10
    `);
    
    console.log('\n💡 TOP CREATIVE AI STRATEGIES:');
    console.log('─'.repeat(40));
    creativeStrategies.rows.forEach(row => {
      console.log(`${row.strategy_name} (${row.overall_score}/100)`);
      console.log(`  Property: ${row.property_address}`);
    });

    // 8. Decision Types Summary
    const decisionTypes = await db.execute(sql`
      SELECT 
        decision_type,
        COUNT(*) as count,
        COUNT(DISTINCT agent_name) as agent_count,
        AVG(confidence::numeric) as avg_confidence
      FROM llm_decisions
      GROUP BY decision_type
      ORDER BY count DESC
    `);
    
    console.log('\n📋 DECISION TYPES SUMMARY:');
    console.log('─'.repeat(40));
    decisionTypes.rows.forEach(row => {
      console.log(`${row.decision_type}: ${row.count} decisions from ${row.agent_count} agents (${(row.avg_confidence * 100).toFixed(1)}% avg confidence)`);
    });

  } catch (error) {
    console.error('Error analyzing logs:', error);
  } finally {
    process.exit(0);
  }
}

analyzeLogs();