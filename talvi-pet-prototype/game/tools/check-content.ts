import { args, readInput, evaluate, output, findingText, zodText, fail } from './content/io';
async function main() {
    const a = args(process.argv.slice(2));
    if (a.help) {
        await output(a, 'check:content [--content dir|bundle.json] [--manifest file] [--format text|json] [--out file] [--strict] [--only CHK-005,CHK-009-10,ZOD] [--room id] [--pet id] [--known-missing tools/known-missing-assets.json]');
        return;
    }
    const { files, manifest, knownMissing } = await readInput(a), { report } = evaluate(files, manifest, a, knownMissing);
    const n = report.counts;
    await output(a, a.format === 'json' ? JSON.stringify(report, null, 2) : [
        ...report.zodIssues.map(zodText), ...report.findings.map(findingText), `content: ${n.errors} errors, ${n.warnings} warnings, ${n.info} info (${n.checks} checks, ${n.files} files)`
    ].join('\n'));
    process.exitCode = report.exitCode;
}
main().catch(fail);
