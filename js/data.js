/* ===== 게임 데이터 정의 ===== */

// 탑 최대 층수 (업데이트로 확장 예정)
const TOWER_MAX_FLOOR = 30;

// 방치 기본 경험치 획득 속도 (초당)
const BASE_IDLE_RATE = 0.5; // 탭(1/tap)보다 느림

// 레벨 구간별 훈련 모습 텍스트 (기본값)
const TRAINING_ACTIONS_DEFAULT = {
  beginner: ['헉헉... 힘들어!', '으으... 조금만 더!', '이거 맞아...?', '열심히!'],
  intermediate: ['점점 감이 와!', '이 정도는 거뜬해!', '좋아, 좋아!', '더 할 수 있어!'],
  advanced: ['몸이 가벼워졌어!', '이 힘... 느껴져!', '한계를 넘는다!', '멈출 수 없어!'],
  master: ['경지에 다다르고 있어...', '이것이 진짜 나야', '하늘이 응답한다!', '각성이 가까워!']
};

// 레벨업 보상 정의 (성장 보상: 레벨업 시 경험치 배율 아이템 지급)
const LEVELUP_REWARDS = [
  { level: 10, type: 'exp_multiplier', value: 1.2, duration: 300, name: '경험치 부스트 I' },
  { level: 25, type: 'exp_multiplier', value: 1.3, duration: 300, name: '경험치 부스트 II' },
  { level: 50, type: 'exp_multiplier', value: 1.5, duration: 600, name: '경험치 부스트 III' },
  { level: 100, type: 'gold', value: 500, name: '골드 보너스 I' },
  { level: 150, type: 'gold', value: 1500, name: '골드 보너스 II' },
  { level: 200, type: 'exp_multiplier', value: 2.0, duration: 600, name: '경험치 부스트 IV' },
];

const BEAST_DATA = {
  cheongryong: {
    id: 'cheongryong',
    name: '청룡',
    symbol: '青',
    color: '#4fc3f7',
    gradient: 'linear-gradient(135deg, #4fc3f7, #1a73e8)',
    personality: '호쾌한 여장부. 허당끼 있음.',
    origin: '해적단 말단. 자신은 엄청난 존재라 큰소리치지만 현실은 허드렛일만 함.',
    meeting: '플레이어가 해적단을 부수고 함께 탈출.',
    awakened: '진짜 여장부로 거듭남. 위압감 있는 실력자.',
    description: '전설 속 동방의 수호신. 호쾌하고 허당끼 있는 성격으로, 해적단 말단으로 살고 있었다.',
    tmi: [
      { star: 1, text: '좋아하는 음식은 생선구이. 해적단에서 매일 먹어서 질렸다고 하지만 사실 아직도 좋아함.' },
      { star: 2, text: '잠버릇이 나쁨. 자면서 "난 대단하다고!" 라고 중얼거림.' },
      { star: 3, text: '바다를 무서워함. 해적단에 있으면서도 배 위에서는 항상 난간을 붙잡고 있었음.' },
      { star: 4, text: '사실 요리를 잘함. 해적단에서 허드렛일이라고 시킨 게 주방 담당이었는데 재능이 있었음.' },
      { star: 5, text: '전생의 기억이 희미하게 꿈에 나옴. 하늘을 나는 꿈을 자주 꿈.' }
    ],
    dialogues: {
      normal: [
        '후후, 오늘도 대단한 내가 왔다!',
        '뭐 봐! 나한테 반했어?',
        '배고프다... 생선구이 먹고 싶어...',
        '나중에 내가 엄청 강해지면 놀라지 마!',
        '오늘 날씨 좋다! 훈련하기 딱이야!'
      ],
      star_mid: [
        '흠, 슬슬 몸이 풀리는 느낌이야! 나 좀 강해진 거 아냐?',
        '해적단 시절이랑은 비교도 안 되지! 이제 진짜 시작이야!',
        '너 덕분에 여기까지 왔어. ...아, 아닌가? 내 실력이지!',
        '이 정도면 나도 꽤 쓸만하다고! 인정해줘!'
      ],
      star_high: [
        '하늘을 나는 꿈... 점점 선명해지고 있어.',
        '이 힘, 예전에도 느껴본 적이 있는 것 같아. 전생의 기억일까?',
        '나는 대단한 존재야. ...이번엔 진심이야.',
        '너와 함께라면, 뭐든 해낼 수 있을 것 같아.',
        '각성이 가까워지고 있어. 느껴져... 하늘이 날 부르고 있어.'
      ],
      affection_high: [
        '너... 나한테 잘해주는 거, 고마워.',
        '옆에 있으면 왠지 마음이 편해져.',
        '내가 지켜줄게! ...아, 아직은 좀 약하지만!',
        '같이 있는 시간이 제일 좋아.',
        '떠나지 마... 라고 하면 이상하려나?'
      ]
    },
    abandoned_dialogues: [
      '...갑자기 사라지다니. 어디 간 거야?',
      '흥, 나 없이도 잘 지내겠지... 아마도...',
      '돌아오면 한 대 때려줄 거야. 진짜로.',
      '여기 혼자 있으니까... 좀 심심하네.',
      '생선구이도 혼자 먹으니까 맛이 없어...'
    ],
    trainingActions: {
      beginner: ['하! 하! 칼 휘두르기!', '해적단보다 백배 낫다!', '대단한 나의 첫 걸음!'],
      intermediate: ['후후, 슬슬 감이 와!', '이 정도면 중간 보스급?', '바람이 따라온다!'],
      advanced: ['바람을 가르는 검!', '이 힘... 전에도 느꼈어!', '하늘의 기억이...!'],
      master: ['천룡의 기운이 깨어난다!', '하늘이 나를 부른다!', '각성이 눈앞이야!']
    },
    expressions: ['평온', '긴장', '고통', '위기', '다운'],
    towerTheme: '호쾌한 성격의 반대 — 답답하고 소심한 적들과의 전투.'
  },

  baekho: {
    id: 'baekho',
    name: '백호',
    symbol: '白',
    color: '#fff59d',
    gradient: 'linear-gradient(135deg, #fff59d, #f9a825)',
    personality: '도도함. 자신이 누구보다 고귀하다고 생각함.',
    origin: '귀족 집안 하녀. 도도하게 굴다가 혼나지만 굽히지 않음.',
    meeting: '플레이어가 같은 하녀로 잠입해 함께 탈출.',
    awakened: '전우치 스타일. 매우 빠르고 묵직한 공격 + 도술.',
    description: '전설 속 서방의 수호신. 도도하고 고귀한 성격으로, 귀족 집안의 하녀로 살고 있었다.',
    tmi: [
      { star: 1, text: '머리카락 관리에 매우 집착함. 하녀 시절에도 자기 머리만큼은 반드시 정리했음.' },
      { star: 2, text: '높은 곳을 좋아함. 귀족 저택의 지붕 위에 몰래 올라가서 별을 보곤 했음.' },
      { star: 3, text: '귀족 도서관의 책을 몰래 읽었음. 사실 꽤 박학다식함.' },
      { star: 4, text: '혼자 있을 때 노래를 부름. 목소리가 꽤 좋지만 절대 남 앞에선 안 부름.' },
      { star: 5, text: '도도한 건 사실 마음의 방어막. 버림받는 게 무서워서 먼저 벽을 치는 것.' }
    ],
    dialogues: {
      normal: [
        '흥, 내 앞에 서는 것만으로도 영광인 줄 알아.',
        '고귀한 나에게 그런 눈빛을 보내다니.',
        '...뭐야, 왜 자꾸 쳐다보는 거야.',
        '나는 특별한 존재야. 언젠간 증명할 거야.',
        '여기 먼지가 너무 많아. 청소 좀 해.'
      ],
      star_mid: [
        '흠, 이 정도 힘이면 나도 인정할 만하군.',
        '내 진가를 알아보다니, 역시 눈은 있구나.',
        '하녀 시절과는 차원이 다르지. 이게 본래의 나야.',
        '점점 강해지고 있어. 당연한 거지만.'
      ],
      star_high: [
        '이 힘... 익숙해. 마치 원래부터 내 것이었던 것처럼.',
        '고귀함이란 타고나는 거야. 나처럼.',
        '도술의 기운이 느껴져. 곧 완전한 내가 될 수 있어.',
        '별이 유난히 밝게 보여. 각성이 가까운 걸까.',
        '너 앞에서만큼은... 벽을 치고 싶지 않아. 곧 진짜 내 모습을 보여줄게.'
      ],
      affection_high: [
        '...너는 좀 다른 것 같아. 다른 인간들이랑.',
        '나한테 잘하는 이유가 뭐야? ...궁금해서 물어보는 거야.',
        '오늘은... 옆에 있어도 돼.',
        '너한테만 보여주는 거야. 감사히 여겨.',
        '가지 마. ...명령이야.'
      ]
    },
    abandoned_dialogues: [
      '...버린 거야? 나를? ...그래, 익숙해.',
      '흥, 돌아오지 않아도 상관없어. ...정말이야.',
      '저택의 하녀 시절이 떠올라. 또 혼자가 된 기분.',
      '높은 곳에서 먼 곳을 바라보면... 네가 보일까.',
      '돌아오면 용서해줄지도... 아니, 쉽게는 안 돼.'
    ],
    trainingActions: {
      beginner: ['흥, 이런 하찮은 훈련이라니...', '도술의 기초... 해볼까.', '고귀한 나에게 이런 걸...'],
      intermediate: ['도술이 손에 익기 시작했어.', '이 정도는 식은 죽 먹기야.', '빠르고 정확하게!'],
      advanced: ['도술의 흐름이 보여!', '속도가 한계를 넘었어!', '묵직한 일격을 느껴봐!'],
      master: ['전우치의 도술이 내 안에!', '백호의 기운... 각성한다!', '이것이 본래의 내 힘!']
    },
    expressions: ['평온', '긴장', '고통', '위기', '다운'],
    towerTheme: '도도한 성격의 반대 — 자기보다 잘난 척하는 적들과의 전투.'
  },

  jujak: {
    id: 'jujak',
    name: '주작',
    symbol: '朱',
    color: '#ef5350',
    gradient: 'linear-gradient(135deg, #ef5350, #b71c1c)',
    personality: '귀엽고 맘씨 좋음. 남을 잘 챙김.',
    origin: '고아원에서 왕따. 맘씨 좋게 다 챙겨주는데 오히려 이용당함.',
    meeting: '플레이어가 고아원에서 입양.',
    awakened: '성격은 그대로지만 플레이어에 대한 애정이 무겁고 집착에 가까워짐.',
    description: '전설 속 남방의 수호신. 귀엽고 마음씨 좋은 성격으로, 고아원에서 왕따 당하며 살고 있었다.',
    tmi: [
      { star: 1, text: '꽃을 좋아함. 고아원 뒤뜰에 몰래 꽃밭을 만들었었음.' },
      { star: 2, text: '음식을 나눠주는 걸 좋아함. 자기 몫을 줄여서라도 다른 아이들에게 줬음.' },
      { star: 3, text: '밤이 무서움. 하지만 무서워하는 다른 아이를 위해 억지로 용감한 척 했음.' },
      { star: 4, text: '그림을 잘 그림. 고아원 벽에 몰래 그린 벽화가 있었음.' },
      { star: 5, text: '"사라지지 마"라는 말을 가장 무서워함. 자기가 먼저 버림받을까봐.' }
    ],
    dialogues: {
      normal: [
        '오늘도 좋은 하루야! 밥은 먹었어?',
        '다친 데는 없어? 내가 봐줄까?',
        '같이 꽃 보러 갈래? 예쁜 꽃밭이 있어!',
        '모두 행복하면 좋겠다...',
        '나, 도움이 되고 있는 거지...?'
      ],
      star_mid: [
        '나도 이제 꽤 강해졌지? 너를 지켜줄 수 있을 만큼!',
        '예전엔 이용만 당했는데... 이제는 내 힘으로 누군가를 지킬 수 있어.',
        '불꽃이 따뜻해지고 있어. 마음처럼.',
        '같이 있는 시간이 길어질수록, 더 강해지고 싶어져.'
      ],
      star_high: [
        '이 불꽃... 누군가를 위해 타오르는 거야. 너를 위해.',
        '각성이 가까워지면... 나, 변하게 될까? 무섭기도 해.',
        '날개가 돋는 꿈을 꿨어. 하늘 높이 날아서... 너를 찾아가는 꿈.',
        '사라지지 않을게. 절대로. 약속해.',
        '내 불꽃은 너만을 위한 거야. 영원히.'
      ],
      affection_high: [
        '나... 너만 있으면 돼.',
        '다른 사람한테 웃지 마. 나한테만 웃어줘.',
        '어디 가는 거야? 나도 같이 갈래!',
        '영원히 같이 있자. 약속해.',
        '...나 없으면 안 되지? 그렇지?'
      ]
    },
    abandoned_dialogues: [
      '어디 간 거야...? 나 혼자 두고... 또...',
      '돌아와. 제발 돌아와. 나 여기 있어...',
      '고아원 때처럼... 또 버림받은 거야?',
      '매일 네가 올 곳을 바라보고 있어. 꼭 돌아올 거지?',
      '사라지지 말라고 했잖아... 내가 먼저 버림받았네.'
    ],
    trainingActions: {
      beginner: ['불꽃이... 조금 나왔어!', '으, 뜨거워! 하지만 괜찮아!', '열심히 해볼게!'],
      intermediate: ['불꽃이 안정되고 있어!', '따뜻한 불꽃으로 지켜줄게!', '점점 강해지는 느낌!'],
      advanced: ['불꽃이 활활 타올라!', '이 힘으로 모두를 지킬 수 있어!', '날개가... 보이는 것 같아!'],
      master: ['불새의 날개가 펼쳐진다!', '불꽃이 영원히 타오른다!', '주작의 각성이 시작돼!']
    },
    expressions: ['평온', '긴장', '고통', '위기', '다운'],
    towerTheme: '맘씨 좋은 성격의 반대 — 약자를 괴롭히는 적들과의 전투.'
  },

  hyeonmu: {
    id: 'hyeonmu',
    name: '현무',
    symbol: '玄',
    color: '#66bb6a',
    gradient: 'linear-gradient(135deg, #66bb6a, #2e7d32)',
    personality: '바보같음. 아무 생각 없이 평화롭게 삶.',
    origin: '호수 위에 수달처럼 둥둥 떠서 살고 있음.',
    meeting: '플레이어가 먹이로 유인해 데려옴.',
    awakened: '독뱀을 다루고 땅 구르기 한 번에 온 산이 울리는 괴력가. 성격은 여전히 바보같음.',
    description: '전설 속 북방의 수호신. 바보같고 평화로운 성격으로, 호수에서 둥둥 떠다니며 살고 있었다.',
    tmi: [
      { star: 1, text: '물에 뜨는 게 특기. 아무것도 안 해도 절대 안 가라앉음.' },
      { star: 2, text: '벌레를 무서워하는데 벌레가 다가오면 도망 안 치고 그냥 울음.' },
      { star: 3, text: '먹는 걸 매우 좋아함. 뭘 줘도 "맛있다!" 라고 함.' },
      { star: 4, text: '사실 힘이 엄청 셈. 본인은 모르지만 화나면 땅이 흔들림.' },
      { star: 5, text: '가끔 이상하게 깊은 말을 함. 본인은 무슨 뜻인지 모름.' }
    ],
    dialogues: {
      normal: [
        '으아~ 좋은 날이다~',
        '배고프다... 뭐 먹을 거 있어?',
        '둥둥 떠다니고 싶다...',
        '어? 뭐? 아 그냥 멍때리고 있었어.',
        '잠이 온다... 쿨쿨...'
      ],
      star_mid: [
        '어? 나 힘이 좀 세진 것 같아? 으헤헤~',
        '뭔가 몸이 근질근질해. 좋은 느낌이야~',
        '땅이 울리는 건... 내가 그런 거야? 모르겠다~',
        '맛있는 거 먹으니까 힘이 나! 더 줘~'
      ],
      star_high: [
        '으음... 뭔가 머릿속이 맑아지는 것 같기도 하고...',
        '뱀 친구가 보여. 무섭지만... 친구인 것 같아.',
        '산이 흔들려도 괜찮아. 내가 지켜줄... 수 있을까?',
        '깊은 곳에서 뭔가 깨어나고 있어. 잘 모르겠지만, 나쁜 건 아닌 것 같아.',
        '가끔 꿈에서 아주 큰 거북이가 보여. 나... 인 것 같기도 하고.'
      ],
      affection_high: [
        '너랑 같이 있으면 따뜻해~',
        '나 잘 모르지만... 너 좋아하는 것 같아.',
        '가지 마~ 외로워~',
        '너한테 맛있는 거 줄래! ...뭘 주면 되지?',
        '같이 낮잠 자자. 여기 자리 좋아.'
      ]
    },
    abandoned_dialogues: [
      '...어? 없다. 어디 갔지?',
      '혼자 떠다니니까... 좀 추워.',
      '맛있는 거 줄 사람이 없어... 배고파...',
      '물 위에 떠 있으면 언젠간 돌아올 거지...?',
      '외로워... 근데 외로운 게 뭔지 이제 알 것 같아.'
    ],
    trainingActions: {
      beginner: ['으아~ 힘들다~ 물 줘~', '둥둥... 아 훈련해야지!', '이거 맞나...? 모르겠다~'],
      intermediate: ['어? 힘이 세진 것 같아?', '땅이 울린다! 내가 한 건가?', '으헤헤, 재밌어!'],
      advanced: ['대지가 내 편이야!', '물이 나를 감싸준다!', '뱀 친구가 도와줘!'],
      master: ['현천의 괴력이 깨어난다!', '산이 흔들려도 끄떡없어!', '현무의 각성... 이건가?']
    },
    expressions: ['평온', '긴장', '고통', '위기', '다운'],
    towerTheme: '바보같은 성격의 반대 — 머리 쓰는 트릭 계열 적들과의 전투.'
  },

  hwangryong: {
    id: 'hwangryong',
    name: '황룡',
    symbol: '黃',
    color: '#ffd54f',
    gradient: 'linear-gradient(135deg, #ffd54f, #ff8f00)',
    personality: '공허함. 자신이 왜 존재하는지 모름.',
    origin: '4신수 각성 완료 후 시스템 창에서 어린이 모습으로 실체화.',
    meeting: '시스템으로서 처음부터 함께했지만, 실체화되면서 진짜 만남이 시작됨.',
    awakened: '왜소한 신(진짜 황룡)과 합쳐져 완전한 황룡이 됨.',
    description: '시스템이 실체화된 존재. 자신이 왜 존재하는지 모르는 공허한 아이.',
    tmi: [
      { star: 1, text: '감정이 뭔지 잘 모름. 다른 신수들이 웃는 걸 보면 따라 웃어보지만 어색함.' },
      { star: 2, text: '시스템이었을 때의 기억이 있음. 숫자와 데이터로 세상을 봤던 기억.' },
      { star: 3, text: '왜소한 신을 보면 이상한 느낌이 듬. 왜인지는 모름.' },
      { star: 4, text: '밤에 혼자 있으면 "왜 나는 여기 있는 걸까" 라고 중얼거림.' },
      { star: 5, text: '사실 만들어진 존재. 진짜 황룡의 시스템적 면이 분리된 인형.' }
    ],
    dialogues: {
      normal: [
        '....',
        '미션을 수행해.',
        '왜 나를 보는 거야.',
        '나는... 뭘까.',
        '시스템 로그 확인 중...'
      ],
      star_mid: [
        '...데이터가 늘어나고 있어. 이건... 성장?',
        '감정이라는 변수가 점점 커지고 있어.',
        '시스템 밖의 세계는... 복잡해. 하지만 싫지는 않아.',
        '다른 신수들을 관찰 중. 그들은 왜 웃는 걸까.'
      ],
      star_high: [
        '왜소한 신의 데이터와 내 데이터가... 공명하고 있어.',
        '나는 인형이야. 하지만... 인형도 뭔가를 느낄 수 있을까.',
        '합일이 가까워지고 있어. 나라는 존재가 사라질 수도 있어.',
        '두려워. ...이게 두려움이라는 감정이구나.',
        '완전해지면, 지금의 나는 어떻게 되는 걸까.'
      ],
      affection_high: [
        '너랑 있으면... 뭔가 따뜻해. 이게 뭘까.',
        '가끔 꿈을 꿔. 하늘을 나는 꿈.',
        '나를 만들어준 건 누구일까. 왜일까.',
        '사라지지 않을 거지...? 너는.',
        '처음으로... 존재하는 게 싫지 않아.'
      ]
    },
    abandoned_dialogues: [
      '...접속이 끊겼어. 왜?',
      '시스템 로그에 너의 흔적만 남아 있어.',
      '공허해. 원래 공허했지만... 지금은 다른 종류의 공허함이야.',
      '돌아와. ...이게 그리움이라는 건가.',
      '만들어진 존재도 외로울 수 있다는 걸 알게 됐어.'
    ],
    trainingActions: {
      beginner: ['...데이터 수집 중.', '시스템 로그... 훈련 시작.', '이것이 훈련...'],
      intermediate: ['데이터 축적... 성장 감지.', '빛의 파동이 안정화 중.', '감정 변수... 증가.'],
      advanced: ['시스템 한계 돌파 중!', '빛이 점점 강해져!', '왜소한 신의 데이터와 공명!'],
      master: ['합일이 시작된다...!', '완전한 황룡의 빛!', '나는... 진짜가 된다!']
    },
    expressions: ['평온', '긴장', '고통', '위기', '다운'],
    towerTheme: '공허한 성격의 반대 — 강한 자아와 신념을 가진 적들과의 전투.',
    unlockCondition: 'all_awakened' // 4신수 모두 각성 후 해금
  }
};

// 성급 정의
const STAR_GRADES = [
  { star: 1, minLevel: 1, maxLevel: 50, bonus: 0, label: '★' },
  { star: 2, minLevel: 51, maxLevel: 100, bonus: 1, label: '★★' },
  { star: 3, minLevel: 101, maxLevel: 150, bonus: 2, label: '★★★' },
  { star: 4, minLevel: 151, maxLevel: 200, bonus: 3, label: '★★★★' },
  { star: 5, minLevel: 201, maxLevel: 250, bonus: 4, label: '★★★★★' }
];

const AWAKENED_BONUS = 6;

// 경험치 테이블 (레벨당 필요 경험치)
function getExpForLevel(level) {
  return Math.floor(50 * Math.pow(1.08, level - 1));
}

// 전투 다이스 결과 해석
const DICE_RESULTS = {
  fail: { min: 2, max: 4, label: '실패', class: 'log-miss', dmgMult: 0 },
  normal: { min: 5, max: 7, label: '평타', class: '', dmgMult: 1 },
  good: { min: 8, max: 10, label: '좋은 공격', class: 'log-good', dmgMult: 1.5 },
  critical: { min: 11, max: 12, label: '크리티컬!', class: 'log-critical', dmgMult: 2.5 }
};

// 적 HP 상태 텍스트
const ENEMY_HP_STATES = [
  { threshold: 1.0, text: '멀쩡함' },
  { threshold: 0.75, text: '약간 지쳐보임' },
  { threshold: 0.50, text: '많이 지쳐보임' },
  { threshold: 0.25, text: '거의 쓰러질 것 같음' },
  { threshold: 0, text: '쓰러짐' }
];

// 훈련도구
const TRAINING_TOOLS = [
  { id: 'tool_basic', name: '나무 훈련봉', desc: '방치 수익 +1/초', iconClass: 'icon-hammer', cost: 100, costType: 'gold', bonus: 1, tier: 'normal' },
  { id: 'tool_iron', name: '철제 훈련봉', desc: '방치 수익 +3/초', iconClass: 'icon-sword', cost: 500, costType: 'gold', bonus: 3, tier: 'normal' },
  { id: 'tool_steel', name: '강철 훈련세트', desc: '방치 수익 +8/초', iconClass: 'icon-tools', cost: 2000, costType: 'gold', bonus: 8, tier: 'advanced' },
  { id: 'tool_magic', name: '마법 훈련석', desc: '방치 수익 +20/초', iconClass: 'icon-star', cost: 8000, costType: 'gold', bonus: 20, tier: 'advanced' },
  { id: 'tool_divine', name: '신성 훈련의', desc: '방치 수익 +50/초 (30일)', iconClass: 'icon-crown-stars', cost: 0, costType: 'cash', bonus: 50, tier: 'premium', duration: 30 }
];

// 상점 호감도 아이템 (골드 또는 현금으로 구매)
const AFFECTION_ITEMS = [
  { id: 'gift_flower', name: '들꽃 다발', desc: '호감도 +5', iconClass: 'icon-gift', cost: 50, costType: 'gold', value: 5 },
  { id: 'gift_cake', name: '수제 케이크', desc: '호감도 +15', iconClass: 'icon-gift', cost: 200, costType: 'gold', value: 15 },
  { id: 'gift_gem', name: '빛나는 보석', desc: '호감도 +40', iconClass: 'icon-star', cost: 800, costType: 'gold', value: 40 },
  { id: 'gift_star', name: '별의 조각', desc: '호감도 +100', iconClass: 'icon-badge-star', cost: 3000, costType: 'gold', value: 100 }
];

// 호감도 레벨 (10단계, 각 단계별 필요 호감도)
const AFFECTION_LEVELS = [
  { level: 1, required: 0, atkBonus: 0 },
  { level: 2, required: 50, atkBonus: 1 },
  { level: 3, required: 150, atkBonus: 2, storyUnlock: 1 },
  { level: 4, required: 300, atkBonus: 3 },
  { level: 5, required: 500, atkBonus: 4 },
  { level: 6, required: 800, atkBonus: 5 },
  { level: 7, required: 1200, atkBonus: 6, storyUnlock: 2 },
  { level: 8, required: 1800, atkBonus: 7 },
  { level: 9, required: 2500, atkBonus: 8 },
  { level: 10, required: 3500, atkBonus: 10, storyUnlock: 3, personalStory: true }
];

// 황금 고블린 드랍 테이블
const GOBLIN_DROPS = [
  { type: 'affection_item', weight: 60, item: 'gift_flower', label: '들꽃 다발' },
  { type: 'gold', weight: 30, amount: 100, label: '골드 100' },
  { type: 'gacha_random', weight: 7, label: '랜덤 스킨 가챠권' },
  { type: 'gacha_select', weight: 3, label: '스킨 선택권 (희귀)' }
];

// === CG 이미지 경로 관리 ===
const CG_FOLDER_MAP = {
  cheongryong: 'chungryong',
  baekho: 'baekho',
  jujak: 'jujak',
  hyeonmu: 'hyeonmu',
  hwangryong: 'hwangryong'
};

const BEAST_UI_PORTRAIT_MAP = {
  cheongryong: 'assets/ui/beasts/cheongryong_portrait.png',
  baekho: 'assets/ui/beasts/baekho_portrait.png',
  jujak: 'assets/ui/beasts/jujak_portrait.png',
  hyeonmu: 'assets/ui/beasts/hyeonmu_portrait.png',
  hwangryong: 'assets/ui/beasts/hwangryong_portrait.png'
};

const TINY_GOD_SPRITE_PATH = 'assets/ui/misc/tiny_god.png';

// 성장 단계별 사용 가능한 감정 애니메이션
const CG_EMOTIONS = {
  cheongryong: { child: ['happy', 'dislike'], youth: [], adult: [] },
  baekho: { child: [], youth: [], adult: [] },
  jujak: { child: ['happy', 'dislike', 'dislike_puff', 'smile'], youth: [], adult: [] },
  hyeonmu: { child: ['happy', 'dislike'], youth: [], adult: [] },
  hwangryong: { child: [], youth: [], adult: [] }
};

function getGrowthStage(starGrade, awakened) {
  if (awakened || starGrade >= 5) return 'adult';
  if (starGrade >= 3) return 'youth';
  return 'child';
}

function getCGStandingPath(beastId) {
  const folder = CG_FOLDER_MAP[beastId] || beastId;
  const beast = (typeof GameState !== 'undefined') ? GameState.beasts[beastId] : null;
  if (!beast) return null;
  const stage = getGrowthStage(beast.starGrade, beast.awakened);
  return `assets/cg/${folder}/${stage}/standing_main.png`;
}

function getCGEmotionPath(beastId, emotion) {
  const folder = CG_FOLDER_MAP[beastId] || beastId;
  const beast = (typeof GameState !== 'undefined') ? GameState.beasts[beastId] : null;
  if (!beast) return null;
  const stage = getGrowthStage(beast.starGrade, beast.awakened);
  // Emotion videos are delivered as alpha WebM.
  return `assets/cg/${folder}/${stage}/${emotion}_main.webm`;
}

function getRandomEmotion(beastId) {
  const beast = (typeof GameState !== 'undefined') ? GameState.beasts[beastId] : null;
  if (!beast) return null;
  const stage = getGrowthStage(beast.starGrade, beast.awakened);
  const emotions = CG_EMOTIONS[beastId]?.[stage];
  if (!emotions || emotions.length === 0) return null;
  return emotions[Math.floor(Math.random() * emotions.length)];
}

function getBeastPortraitPath(beastId) {
  return BEAST_UI_PORTRAIT_MAP[beastId] || null;
}

function getTinyGodSpritePath() {
  return TINY_GOD_SPRITE_PATH;
}

const STORY_SCENE_BG_MAP = {
  orphanage: 'assets/story/bg/orphanage.png',
  market: 'assets/story/bg/market.png',
  forest: 'assets/story/bg/forest.png',
  ocean: 'assets/story/bg/ocean.png',
  mountain: 'assets/story/bg/mountain.png',
  home: 'assets/story/bg/home.png',
  battlefield: 'assets/story/bg/battlefield.png',
  temple: 'assets/story/bg/temple.png',
  alley: 'assets/story/bg/alley.png',
  sky: 'assets/story/bg/sky.png'
};

function getStorySceneBackgroundPath(sceneKey) {
  return STORY_SCENE_BG_MAP[sceneKey] || null;
}

const MAIN_BG_DEFAULT_PATH = 'assets/cg/bg/bg.jpg';

const MAIN_BG_OPTIONS = [
  { id: 'bg_default', name: '기본 배경', path: 'assets/cg/bg/bg.jpg' },
  { id: 'bg_1', name: '배경 1', path: 'assets/cg/bg/021496e0-69e1-474d-9396-02f2717c6a78.jpg' },
  { id: 'bg_2', name: '배경 2', path: 'assets/cg/bg/55641850-7be6-4e26-bba0-f316bd3d7a35.jpg' },
  { id: 'bg_3', name: '배경 3', path: 'assets/cg/bg/f116d22f-693a-459c-87f4-e425a9c216ee.jpg' }
];

function getMainBackgroundDefaultPath() {
  return MAIN_BG_DEFAULT_PATH;
}

function getMainBackgroundOptions() {
  return MAIN_BG_OPTIONS;
}

// 스킨 데이터 (프레임워크만)
const SKIN_DATA = {
  cheongryong: [
    { id: 'skin_cr_default', name: '기본', owned: true },
    { id: 'skin_cr_summer', name: '여름 바다', cost: 0, costType: 'cash' },
    { id: 'skin_cr_winter', name: '겨울 축제', cost: 0, costType: 'cash' },
    { id: 'skin_cr_awakened', name: '각성: 천룡', cost: 0, costType: 'cash' },
    { id: 'skin_cr_daily', name: '일상복', cost: 0, costType: 'cash' }
  ],
  baekho: [
    { id: 'skin_bh_default', name: '기본', owned: true },
    { id: 'skin_bh_noble', name: '귀족 드레스', cost: 0, costType: 'cash' },
    { id: 'skin_bh_spring', name: '봄꽃', cost: 0, costType: 'cash' },
    { id: 'skin_bh_awakened', name: '각성: 도술사', cost: 0, costType: 'cash' },
    { id: 'skin_bh_daily', name: '일상복', cost: 0, costType: 'cash' }
  ],
  jujak: [
    { id: 'skin_jj_default', name: '기본', owned: true },
    { id: 'skin_jj_angel', name: '천사', cost: 0, costType: 'cash' },
    { id: 'skin_jj_autumn', name: '가을 단풍', cost: 0, costType: 'cash' },
    { id: 'skin_jj_awakened', name: '각성: 불새', cost: 0, costType: 'cash' },
    { id: 'skin_jj_daily', name: '일상복', cost: 0, costType: 'cash' }
  ],
  hyeonmu: [
    { id: 'skin_hm_default', name: '기본', owned: true },
    { id: 'skin_hm_swim', name: '수영복', cost: 0, costType: 'cash' },
    { id: 'skin_hm_forest', name: '숲의 아이', cost: 0, costType: 'cash' },
    { id: 'skin_hm_awakened', name: '각성: 현천', cost: 0, costType: 'cash' },
    { id: 'skin_hm_daily', name: '일상복', cost: 0, costType: 'cash' }
  ],
  hwangryong: [
    { id: 'skin_hr_default', name: '기본', owned: true },
    { id: 'skin_hr_system', name: '시스템 모드', cost: 0, costType: 'cash' },
    { id: 'skin_hr_merge', name: '합일', cost: 0, costType: 'cash' },
    { id: 'skin_hr_awakened', name: '각성: 완전체', cost: 0, costType: 'cash' },
    { id: 'skin_hr_daily', name: '일상복', cost: 0, costType: 'cash' }
  ]
};
