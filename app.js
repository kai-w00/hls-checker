const RIVERS = {
  han: {
    title: "한강",
    server: "http://211.181.145.25:9090",
    openuser_id: "MMS20240930092445339",
    sources: ["한강홍수통제소", "한강유역환경청"],
  },
  geum: {
    title: "금강",
    server: "http://112.166.0.200:9090",
    openuser_id: "MMS20240821161805883",
    sources: ["금강홍수통제소", "금강유역환경청"],
  },
  yeongsan: {
    title: "영산강",
    server: "http://61.36.160.117:9090",
    openuser_id: "MMS20240823144450171",
    sources: ["영산강홍수통제소", "영산강유역환경청"],
  },
  nakdong: {
    title: "낙동강",
    server: "http://211.170.143.5:9090",
    openuser_id: "MMS20240517132147799",
    sources: ["낙동강홍수통제소", "낙동강유역환경청"],
  },
};

let riverData = {};
let currentRiver = "han";
let currentList = [];
let checkList = [];

function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

function addLog(text) {
  const box = document.getElementById("logBox");
  const now = new Date().toLocaleTimeString();
  box.innerHTML += `<div>[${now}] ${text}</div>`;
  box.scrollTop = box.scrollHeight;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.json();
}

async function loadOneRiver(key) {
  const cfg = RIVERS[key];

  setStatus(`${cfg.title} 토큰 요청 중...`);
  addLog(`${cfg.title} apiopenstatus 요청`);

  const tokenData = await postJson(`${cfg.server}/openapi/v1/apiopenstatus`, {
    openuser_id: cfg.openuser_id,
  });

  if (String(tokenData.status_code) !== "200") {
    throw new Error(`${cfg.title} 토큰 발급 실패`);
  }

  const serviceToken = tokenData.service_token;

  setStatus(`${cfg.title} 목록 조회 중...`);
  addLog(`${cfg.title} videolowlist 요청`);

  const listData = await postJson(`${cfg.server}/openapi/v1/videolowlist`, {
    service_token: serviceToken,
  });

  const items = listData.result_value || [];

  riverData[key] = {
    ...cfg,
    service_token: serviceToken,
    items,
    loaded_at: new Date().toLocaleString(),
  };

  addLog(`${cfg.title} 목록 조회 완료: ${items.length}개`);
}

async function loadAllRivers() {
  try {
    setStatus("4대강 API 조회 중...");
    addLog("4대강 API 조회 시작");

    for (const key of Object.keys(RIVERS)) {
      try {
        await loadOneRiver(key);
      } catch (e) {
        addLog(`${RIVERS[key].title} 조회 실패: ${e.message}`);
      }
    }

    changeRiver(currentRiver);
    const total = Object.values(riverData).reduce((sum, d) => sum + d.items.length, 0);
    setStatus(`API 조회 완료: 전체 ${total}개`);
  } catch (e) {
    setStatus("API 조회 오류");
    addLog(`오류: ${e.message}`);
  }
}

function changeRiver(key) {
  currentRiver = key;

  const select = document.getElementById("sourceFilter");
  select.innerHTML = `<option value="전체">전체</option>`;

  for (const source of RIVERS[key].sources) {
    select.innerHTML += `<option value="${source}">${source}</option>`;
  }

  renderCameraList();
}

function makeCamera(raw) {
  return {
    river_key: currentRiver,
    river_name: RIVERS[currentRiver].title,
    device_id: String(raw.deviceId || ""),
    device_name: raw.deviceName || "",
    video_source: raw.videoSource || "",
    video_type: raw.videoType || "",
    video_size: raw.videoSize || "",
    lat: raw.latValue || null,
    lng: raw.lngValue || null,
  };
}

function renderCameraList() {
  const data = riverData[currentRiver];
  const listEl = document.getElementById("cameraList");

  if (!data) {
    listEl.innerHTML = `<div class="camera-item">데이터 없음. API 재조회를 눌러주세요.</div>`;
    return;
  }

  const source = document.getElementById("sourceFilter").value;
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();

  currentList = data.items
    .map(makeCamera)
    .filter((cam) => {
      if (source !== "전체" && cam.video_source !== source) return false;

      const target = `${cam.device_id} ${cam.device_name} ${cam.video_source}`.toLowerCase();
      if (keyword && !target.includes(keyword)) return false;

      return true;
    });

  listEl.innerHTML = "";

  for (const cam of currentList) {
    const div = document.createElement("div");
    div.className = "camera-item";
    div.innerHTML = `
      <strong>${cam.device_name}</strong>
      <span>[${cam.video_source}] ${cam.device_id}</span>
    `;
    div.ondblclick = () => openCamera(cam);
    listEl.appendChild(div);
  }

  setStatus(`${RIVERS[currentRiver].title} 표시: ${currentList.length}개`);
}

function buildCheckList() {
  checkList = [...currentList];
  renderCheckTable();
  addLog(`점검 목록 생성: ${checkList.length}개`);
}

function renderCheckTable() {
  const tbody = document.getElementById("checkTable");
  tbody.innerHTML = "";

  checkList.forEach((cam, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check"></td>
      <td>${cam.river_name}</td>
      <td>${cam.video_source}</td>
      <td>${cam.device_id}</td>
      <td class="name">${cam.device_name}</td>
      <td class="wait">대기</td>
      <td>-</td>
      <td>-</td>
    `;
    tbody.appendChild(tr);
  });
}

function selectAllRows(checked) {
  document.querySelectorAll(".row-check").forEach((box) => {
    box.checked = checked;
  });
}

async function getHlsUrl(cam) {
  const data = riverData[cam.river_key];

  const body = await postJson(`${data.server}/openapi/v1/hlsvideo`, {
    service_token: data.service_token,
    device_id: cam.device_id,
  });

  if (String(body.status_code) !== "200") {
    throw new Error("hlsvideo 실패");
  }

  const values = body.result_value || [];
  if (!values.length) {
    throw new Error("HLS URL 없음");
  }

  const item = values[values.length - 1];
  const hlsUrl = item.videoOutput || item.videoOutputSSL;

  if (!hlsUrl) {
    throw new Error("videoOutput 없음");
  }

  return hlsUrl;
}

async function checkManifest(hlsUrl) {
  const res = await fetch(hlsUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Manifest HTTP ${res.status}`);
  }

  const text = await res.text();

  if (!text.includes("#EXTM3U")) {
    throw new Error("Manifest #EXTM3U 없음");
  }

  if (!text.includes("#EXTINF") && !text.includes(".ts") && !text.includes("#EXT-X-STREAM-INF")) {
    throw new Error("Manifest 세그먼트 정보 없음");
  }

  return true;
}

async function startCheck() {
  const rows = [...document.querySelectorAll("#checkTable tr")];
  const selectedRows = rows.filter((row) => row.querySelector(".row-check").checked);

  if (!selectedRows.length) {
    alert("점검할 항목을 선택하세요.");
    return;
  }

  let ok = 0;
  let fail = 0;

  addLog(`선택한 ${selectedRows.length}개 HLS 점검 시작`);

  for (const row of selectedRows) {
    const idx = Number(row.dataset.index);
    const cam = checkList[idx];

    row.children[5].textContent = "점검중";
    row.children[5].className = "wait";
    row.children[6].textContent = "-";
    row.children[7].textContent = "";

    const start = performance.now();

    try {
      const hlsUrl = await getHlsUrl(cam);
      await checkManifest(hlsUrl);

      const elapsed = Math.round(performance.now() - start);
      row.children[5].textContent = "정상";
      row.children[5].className = "ok";
      row.children[6].textContent = elapsed;
      row.children[7].textContent = "정상";
      ok++;
    } catch (e) {
      const elapsed = Math.round(performance.now() - start);
      row.children[5].textContent = "오류";
      row.children[5].className = "fail";
      row.children[6].textContent = elapsed;
      row.children[7].textContent = "비정상";
      fail++;

      addLog(`비정상 | ${cam.video_source} | ${cam.device_id} | ${cam.device_name} | ${e.message}`);
    }

    setStatus(`점검 진행 | 정상 ${ok} / 비정상 ${fail}`);
  }

  addLog(`점검 완료 | 정상 ${ok} / 비정상 ${fail}`);
}

async function openCamera(cam) {
  try {
    setStatus(`HLS 요청 중: ${cam.device_name}`);
    const hlsUrl = await getHlsUrl(cam);

    document.getElementById("playerTitle").textContent = cam.device_name;
    const video = document.getElementById("videoPlayer");
    video.src = hlsUrl;
    document.getElementById("playerModal").style.display = "flex";

    addLog(`HLS 재생 요청: ${cam.device_name}`);
  } catch (e) {
    alert(`HLS 요청 실패: ${e.message}`);
    addLog(`HLS 요청 실패: ${e.message}`);
  }
}

function closePlayer() {
  const video = document.getElementById("videoPlayer");
  video.pause();
  video.src = "";
  document.getElementById("playerModal").style.display = "none";
}

function exportCsv() {
  const rows = [...document.querySelectorAll("#checkTable tr")];

  if (!rows.length) {
    alert("내보낼 목록이 없습니다.");
    return;
  }

  const header = ["선택", "강", "기관", "Device ID", "카메라명", "상태", "응답시간(ms)", "메시지"];
  const lines = [header.join(",")];

  rows.forEach((row) => {
    const checked = row.querySelector(".row-check").checked ? "Y" : "N";
    const values = [
      checked,
      ...[...row.children].slice(1).map((td) => `"${td.textContent.replaceAll('"', '""')}"`),
    ];
    lines.push(values.join(","));
  });

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hls_check_result_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

window.onload = () => {
  addLog("Booki HLS Checker 웹 버전 시작");
  loadAllRivers();
};
