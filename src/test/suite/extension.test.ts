/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

    test('Commands should be registered', async () => {
        const ext = vscode.extensions.getExtension('phine-apps.markdown-link-assistant');
        assert.ok(ext, 'Extension should be present');
        if (!ext.isActive) {
            await ext.activate();
        }

        const commands = await vscode.commands.getCommands(true);
        const expectedCommands = [
          'markdown-link-assistant.openLivePreview',
          'markdown-link-assistant.refreshUnfurl',
          'markdown-link-assistant.unfurlAtCursor',
          'markdown-link-assistant.generateReferences',
          'markdown-link-assistant.validateLinks',
          'markdown-link-assistant.bulkUnfurl',
          'markdown-link-assistant.generateAltText',
          'markdown-link-assistant.setApiKey',
          'markdown-link-assistant.clearApiKey'
        ];

        for (const cmd of expectedCommands) {
          assert.ok(commands.includes(cmd), `${cmd} should be registered`);
        }
    });
});
