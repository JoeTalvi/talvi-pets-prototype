import { args, readInput, evaluate, output, findingText, fail } from './content/io';
async function main() {
    const a = args(process.argv.slice(2));
    if (a.help) {
        await output(a, 'check:content [--content dir|bundle.json] [--manifest file] [--format text|json] [--out file] [--strict] [--only CHK-005,CHK-009-10,ZOD] [--room id] [--pet id]');
        return;
    }
    const { files, manifest } = await readInput(a), { report } = evaluate(files, manifest, a);
    const n = report.counts;
    await output(a, a.format === 'json' ? JSON.stringify(report, null, 2) : [
        ...report.zodIssues.map(i => `ERROR    ZOD  ${i.file}:${i.path}  ${i.message}`), ...report.findings.map(findingText), `content: ${n.errors} errors, ${n.warnings} warnings, ${n.info} info (${n.checks} checks, ${n.files} files)`
    ].join('\n'));
    process.exitCode = report.exitCode;
}
main().catch(fail);
