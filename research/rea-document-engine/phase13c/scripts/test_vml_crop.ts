import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

// Test if Word opens a VML shape with croptop and cropbottom
const testXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pageBreakBefore w:val="0"/>
        <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
      </w:pPr>
      <w:r>
        <w:pict>
          <v:rect id="s1" style="position:absolute;left:0;top:0;margin-left:40pt;margin-top:40pt;width:300pt;height:100pt;z-index:1;mso-position-horizontal-relative:page;mso-position-vertical-relative:page" filled="f" stroked="f">
            <v:imagedata r:id="rId2" croptop="8738f" cropbottom="8738f" o:title="TestCrop"/>
          </v:rect>
        </w:pict>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
      <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

console.log("Testing VML crop attributes syntax...");
console.log(testXml.slice(0, 300));
