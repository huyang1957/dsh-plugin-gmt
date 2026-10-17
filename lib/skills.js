import { cp, mkdir, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = join(__dirname, '..');
export const BUNDLED_SKILLS_DIR = join(PLUGIN_ROOT, 'assets', 'skills');

const SKILL_IDS = [
  'gmt-erp-mcp',
  'gmt-erp-manual',
  'gmt-erp-morning',
  'gmt-erp-order',
  'gmt-erp-chase',
];

export function listBundledSkillIds() {
  return [...SKILL_IDS];
}

function resolveSkillsTarget() {
  // DSH 用户级技能目录（与 basics-panel / 常见约定对齐）
  return join(homedir(), '.dsh', 'skills');
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function installSkills(skillIds = SKILL_IDS) {
  const targetRoot = resolveSkillsTarget();
  await mkdir(targetRoot, { recursive: true });
  const selected = skillIds.length ? skillIds : SKILL_IDS;
  const results = [];
  for (const id of selected) {
    const src = join(BUNDLED_SKILLS_DIR, id);
    const dest = join(targetRoot, id);
    if (!(await exists(src))) {
      results.push({ id, ok: false, message: '内嵌技能不存在' });
      continue;
    }
    await cp(src, dest, { recursive: true, force: true });
    results.push({ id, ok: true, dest });
  }
  return { targetRoot, results };
}

export async function skillsStatus() {
  const targetRoot = resolveSkillsTarget();
  const installed = [];
  if (await exists(targetRoot)) {
    const names = await readdir(targetRoot);
    for (const id of SKILL_IDS) {
      if (names.includes(id)) installed.push(id);
    }
  }
  return { targetRoot, bundled: SKILL_IDS, installed };
}

export function companionInstallCommands(profile = 'desktop', pluginPath = '') {
  const selfPath = (pluginPath || join(dirname(fileURLToPath(import.meta.url)), '..')).replace(/\\/g, '/');
  return {
    profile,
    commands: [
      `dsh plugin --profile ${profile} add dsh-mcp-connector`,
      `dsh plugin --profile ${profile} add @changfenhuang/dsh-genui`,
      `dsh plugin --profile ${profile} add "${selfPath}"`,
    ],
    note: '安装或升级后请完全重启 DeepSeek Harness / dsh web。',
  };
}
