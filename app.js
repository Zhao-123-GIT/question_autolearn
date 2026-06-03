/**
 * 机械制造工艺学终极刷题库 V3 - 业务核心逻辑
 */

// 1. 系统核心状态管理
let currentMode = 'all';       // 可选模式: 'all'(全库), 'random'(随机20题), 'exam'(模拟考试), 'wrong'(错题本)
let activeQuestions = [];       // 当前渲染列表中的题目集
let userAnswers = {};           // 全局用户答案存根缓存 { questionId: 'A' }
let wrongQuestionsPool = [];    // 错题库缓存数组 (只保存错误题目的唯一id)
let examHistory = [];           // 模拟考试成绩记录单
let forceShowAllAnswers = false;// 全局强显标准答案标记位
let isExamSubmitted = false;    // 模拟考是否已交卷结算标记

// DOM 元素缓存
const qContainer = document.getElementById('questionsContainer');
const numNav = document.getElementById('numberNav');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const wrongCountLabel = document.getElementById('wrongCount');
const searchInput = document.getElementById('searchInput');
const examBar = document.getElementById('examActionBar');
const historyList = document.getElementById('historyList');

// 2. 初始化加载器
document.addEventListener('DOMContentLoaded', () => {
  loadLocalStorage();
  switchMode('all');
  initTheme();
  setupEventListeners();
});

// 3. 本地持久化缓存读写
function loadLocalStorage() {
  const savedAnswers = localStorage.getItem('mec_v3_answers');
  if (savedAnswers) userAnswers = JSON.parse(savedAnswers);

  const savedWrongs = localStorage.getItem('mec_v3_wrongs');
  if (savedWrongs) wrongQuestionsPool = JSON.parse(savedWrongs);

  const savedHistory = localStorage.getItem('mec_v3_history');
  if (savedHistory) examHistory = JSON.parse(savedHistory);

  updateWrongCountBadge();
  renderHistoryList();
}

function saveAnswersToStorage() {
  localStorage.setItem('mec_v3_answers', JSON.stringify(userAnswers));
}

function saveWrongsToStorage() {
  localStorage.setItem('mec_v3_wrongs', JSON.stringify(wrongQuestionsPool));
  updateWrongCountBadge();
}

function updateWrongCountBadge() {
  wrongCountLabel.textContent = wrongQuestionsPool.length;
}

// 4. 核心模式切换处理器
function switchMode(mode) {
  currentMode = mode;
  forceShowAllAnswers = false;
  isExamSubmitted = false;
  examBar.classList.add('hidden');
  searchInput.value = '';

  // 更新左侧侧边栏高亮样式
  document.querySelectorAll('.btn-group-vertical .btn').forEach(b => b.classList.remove('active'));
  
  if (mode === 'all') {
    document.getElementById('modeAllBtn').classList.add('active');
    activeQuestions = [...questions];
  } else if (mode === 'random') {
    document.getElementById('modeRandomBtn').classList.add('active');
    activeQuestions = getRandomSubset(questions, 20);
  } else if (mode === 'exam') {
    document.getElementById('modeExamBtn').classList.add('active');
    prepareExamPaper();
    examBar.classList.remove('hidden');
  } else if (mode === 'wrong') {
    document.getElementById('modeWrongBtn').classList.add('active');
    activeQuestions = questions.filter(q => wrongQuestionsPool.includes(q.id));
  }

  renderQuizStructure();
  updateProgressBar();
}

// 5. 组卷策略：模拟考试规则（30道单选 + 20道判断 = 共50题）
function prepareExamPaper() {
  const singlePool = questions.filter(q => q.type === 'single');
  const judgePool = questions.filter(q => q.type === 'judge');
  
  const selectedSingles = getRandomSubset(singlePool, 30);
  const selectedJudges = getRandomSubset(judgePool, 20);
  
  activeQuestions = [...selectedSingles, ...selectedJudges];
}

function getRandomSubset(arr, size) {
  let shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, size);
}

// 6. 核心渲染器：动态DOM结构铺设
function renderQuizStructure() {
  qContainer.innerHTML = '';
  numNav.innerHTML = '';

  if (activeQuestions.length === 0) {
    qContainer.innerHTML = `<div class="card empty-msg">当前列表空空如也（如错题本或搜索无匹配项）。</div>`;
    return;
  }

  activeQuestions.forEach((q, index) => {
    const displayIndex = index + 1;

    // A. 驾考宝典式快捷灯位渲染
    const navBadge = document.createElement('div');
    navBadge.className = 'num-badge';
    navBadge.textContent = displayIndex;
    navBadge.title = `跳转至第 ${displayIndex} 题`;
    
    // 根据是否已作答赋予红/绿底色
    if (userAnswers[q.id]) {
      navBadge.classList.add('answered');
    } else {
      navBadge.classList.add('unanswered');
    }

    navBadge.addEventListener('click', () => {
      document.getElementById(`q-anchor-${q.id}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    numNav.appendChild(navBadge);

    // B. 题目核心卡片 DOM 拼装
    const qCard = document.createElement('article');
    qCard.className = 'card q-card';
    qCard.id = `q-anchor-${q.id}`;

    const typeTxt = q.type === 'single' ? '单选题' : '判断题';
    const stageTxt = q.stage === 1 ? '阶段测验(1)' : '阶段测验(2)';

    // 卡片元数据头
    const qMeta = document.createElement('div');
    qMeta.className = 'q-meta';
    qMeta.innerHTML = `<span>#${displayIndex} (${typeTxt})</span><span>${stageTxt}</span>`;
    qCard.appendChild(qMeta);

    // 题干
    const qTitle = document.createElement('div');
    qTitle.className = 'q-title';
    qTitle.textContent = `${q.id}. ${q.question}`;
    qCard.appendChild(qTitle);

    // 选项组
    const optionsList = document.createElement('div');
    optionsList.className = 'options-list';

    const labels = ['A', 'B', 'C', 'D'];
    q.options.forEach((optStr, oIdx) => {
      const optLetter = labels[oIdx];
      const optionItem = document.createElement('div');
      optionItem.className = 'option-item';
      if (userAnswers[q.id] === optLetter) {
        optionItem.classList.add('selected');
      }

      // 禁止在模拟考交卷后更改选择
      if (!isExamSubmitted) {
        optionItem.addEventListener('click', () => handleSelectOption(q.id, optLetter));
      }

      optionItem.innerHTML = `
        <input type="radio" name="q_opt_${q.id}" value="${optLetter}" ${userAnswers[q.id] === optLetter ? 'checked' : ''} ${isExamSubmitted ? 'disabled' : ''}>
        <span><strong>${optLetter}.</strong> ${optStr}</span>
      `;
      optionsList.appendChild(optionItem);
    });
    qCard.appendChild(optionsList);

    // 独立判分即时解析容器
    const analysisBox = document.createElement('div');
    analysisBox.className = `analysis-box id-analysis-${q.id}`;
    
    // 触发显隐判定的复合条件：开启强显答案 或 属于非考试状态下的已作答题目 或 模拟考交卷后
    const shouldShowAnalysis = forceShowAllAnswers || (currentMode !== 'exam' && userAnswers[q.id]) || (currentMode === 'exam' && isExamSubmitted);
    
    if (shouldShowAnalysis) {
      const isUserRight = userAnswers[q.id] === q.answer;
      analysisBox.classList.add('visible');
      if (isUserRight) {
        analysisBox.classList.add('correct-wrap');
        analysisBox.innerHTML = `✔ 答对了！您的选择：${userAnswers[q.id] || '未作答'} | 正确标准答案：${q.answer}`;
      } else {
        analysisBox.classList.add('wrong-wrap');
        analysisBox.innerHTML = `❌ 答错了或未作答。您的选择：${userAnswers[q.id] || '空'} | 正确标准答案：<strong>${q.answer}</strong>`;
      }
    }
    qCard.appendChild(analysisBox);

    qContainer.appendChild(qCard);
  });
}

// 7. 用户点击作答行为拦截器
function handleSelectOption(qId, selectedLetter) {
  userAnswers[qId] = selectedLetter;
  saveAnswersToStorage();
  
  // 错题库动态同步：非模拟考状态下实时自检对错
  if (currentMode !== 'exam') {
    const targetQ = questions.find(q => q.id === qId);
    if (selectedLetter !== targetQ.answer) {
      if (!wrongQuestionsPool.includes(qId)) {
        wrongQuestionsPool.push(qId);
        saveWrongsToStorage();
      }
    } else {
      // 答对了则洗白：从错题本自动踢出
      wrongQuestionsPool = wrongQuestionsPool.filter(id => id !== qId);
      saveWrongsToStorage();
    }
  }

  // 局部闪烁刷新关联UI组件以防全刷卡顿
  updateProgressBar();
  renderQuizStructure();
}

// 8. 顶部综合进度条更新
function updateProgressBar() {
  // 基于底层完整的全库98道题测算完成百分比
  const answeredCount = questions.filter(q => userAnswers[q.id]).length;
  const pct = Math.round((answeredCount / questions.length) * 100);
  progressBar.style.width = `${pct}%`;
  progressText.textContent = `完成 ${answeredCount} / ${questions.length}`;
}

// 9. 模拟考试全自动交卷结算规则
function evaluateExamSubmission() {
  let doneCount = 0;
  let rightCount = 0;
  let wrongCount = 0;

  activeQuestions.forEach(q => {
    const uAns = userAnswers[q.id];
    if (uAns) {
      doneCount++;
      if (uAns === q.answer) {
        rightCount++;
      } else {
        wrongCount++;
        // 考场错题自动收入本地错题本
        if (!wrongQuestionsPool.includes(q.id)) wrongQuestionsPool.push(q.id);
      }
    } else {
      wrongCount++; // 未答按错题计
      if (!wrongQuestionsPool.includes(q.id)) wrongQuestionsPool.push(q.id);
    }
  });

  saveWrongsToStorage();

  // 算分（模拟考试单题分值：100分满分 / 50题 = 每题2分）
  const finalScore = rightCount * 2;
  const rawRate = (rightCount / activeQuestions.length) * 100;
  const accuracyRate = activeQuestions.length > 0 ? rawRate.toFixed(2) + '%' : '0%';

  // 灌注数据至模态框呈现
  document.getElementById('resScore').textContent = finalScore;
  document.getElementById('resRate').textContent = accuracyRate;
  document.getElementById('resTotal').textContent = activeQuestions.length;
  document.getElementById('resDone').textContent = doneCount;
  document.getElementById('resRight').textContent = rightCount;
  document.getElementById('resWrong').textContent = wrongCount;

  // 历史记录入库
  const timestamp = new Date().toLocaleTimeString();
  examHistory.unshift(`得分: ${finalScore}分 | 正确率: ${accuracyRate} (${timestamp})`);
  if (examHistory.length > 5) examHistory.pop(); // 历史队列保留最高5条
  localStorage.setItem('mec_v3_history', JSON.stringify(examHistory));
  renderHistoryList();

  // 锁死当前卡片编辑态并强展解析区
  isExamSubmitted = true;
  examBar.classList.add('hidden');
  
  // 打开统计弹窗
  document.getElementById('resultModal').classList.remove('hidden');
  
  // 重绘主流区域，标记对错红绿边框
  renderQuizStructure();
}

// 10. 历史看板填充
function renderHistoryList() {
  historyList.innerHTML = '';
  if (examHistory.length === 0) {
    historyList.innerHTML = `<li class="empty-msg">暂无模拟考记录</li>`;
    return;
  }
  examHistory.forEach(itemStr => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span>📝 ${itemStr.split('|')[0]}</span><span style="color:var(--text-muted)">${itemStr.split('|')[1]}</span>`;
    historyList.appendChild(li);
  });
}

// 11. 关键词毫秒级搜索功能
function handleSearch(e) {
  const kw = e.target.value.trim().toLowerCase();
  if (!kw) {
    switchMode(currentMode); // 关键字退格清空后归位当前激活视图
    return;
  }
  // 穿透全库精准扫射
  activeQuestions = questions.filter(q => {
    const matchTitle = q.question.toLowerCase().includes(kw);
    const matchOptions = q.options.some(opt => opt.toLowerCase().includes(kw));
    return matchTitle || matchOptions;
  });
  renderQuizStructure();
}

// 12. 弹窗控制
window.closeModal = function() {
  document.getElementById('resultModal').classList.add('hidden');
}

// 13. 清除重置
function clearAllUserData() {
  if (confirm('⚠️ 警告：该操作将彻底清空您所有的答题记录、错题本以及模拟考试记录，确定恢复初始状态吗？')) {
    userAnswers = {};
    wrongQuestionsPool = [];
    examHistory = [];
    localStorage.removeItem('mec_v3_answers');
    localStorage.removeItem('mec_v3_wrongs');
    localStorage.removeItem('mec_v3_history');
    
    forceShowAllAnswers = false;
    isExamSubmitted = false;
    
    updateWrongCountBadge();
    renderHistoryList();
    switchMode('all');
    alert('🎉 清空成功，数据已全部归零。');
  }
}

// 14. 极简无感亮/暗色模式换肤
function initTheme() {
  const savedTheme = localStorage.getItem('mec_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', targetTheme);
  localStorage.setItem('mec_theme', targetTheme);
}

// 15. 全局静态事件中枢绑定
function setupEventListeners() {
  document.getElementById('modeAllBtn').addEventListener('click', () => switchMode('all'));
  document.getElementById('modeRandomBtn').addEventListener('click', () => switchMode('random'));
  document.getElementById('modeExamBtn').addEventListener('click', () => switchMode('exam'));
  document.getElementById('modeWrongBtn').addEventListener('click', () => switchMode('wrong'));
  
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  document.getElementById('clearDataBtn').addEventListener('click', clearAllUserData);
  
  searchInput.addEventListener('input', handleSearch);
  document.getElementById('submitExamBtn').addEventListener('click', () => {
    if (confirm('确定现在交卷结算成绩吗？')) evaluateExamSubmission();
  });

  // 显示隐藏全部标准答案切换按键
  const toggleAnsBtn = document.getElementById('showAnswersBtn');
  toggleAnsBtn.addEventListener('click', () => {
    forceShowAllAnswers = !forceShowAllAnswers;
    toggleAnsBtn.textContent = forceShowAllAnswers ? '🙈 隐藏全部答案' : '👁️ 显示全部答案';
    toggleAnsBtn.className = forceShowAllAnswers ? 'btn btn-warn' : 'btn btn-info';
    renderQuizStructure();
  });
}