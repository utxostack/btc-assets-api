import { blockchain } from '@ckb-lumos/base';
import { Script } from '@ckb-lumos/lumos';
import { isScriptEqual } from '@rgbpp-sdk/ckb';
import { Cell } from '../routes/rgbpp/types';

/**
 * Get type script from request query
 */
export function getTypeScript(type_script: string | Script | undefined) {
  if (!type_script) {
    return undefined;
  }
  let typeScript: Script | undefined = undefined;
  if (type_script) {
    if (typeof type_script === 'string') {
      if (type_script.startsWith('0x')) {
        typeScript = blockchain.Script.unpack(type_script);
      } else {
        typeScript = JSON.parse(decodeURIComponent(type_script));
      }
    } else {
      typeScript = type_script;
    }
  }
  return typeScript;
}

/**
 * Filter cells by type script
 */
export function filterCellsByTypeScript(cells: Cell[], typeScript: Script) {
  return cells.filter((cell) => {
    if (!cell.cellOutput.type) {
      return false;
    }
    // if typeScript.args is empty, only compare codeHash and hashType
    if (!typeScript.args) {
      const script = { ...cell.cellOutput.type, args: '' };
      return isScriptEqual(script, typeScript);
    }
    return isScriptEqual(cell.cellOutput.type, typeScript);
  });
}
