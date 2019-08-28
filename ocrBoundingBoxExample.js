/*
This was a fun use case, we had a tax program that prints out K1 PDFs.
They look like this: https://www.irs.gov/pub/irs-pdf/f1065sk1.pdf
We extracted the data with the pdf2json NPM, but we needed to know which text field belonged to which section. We had X,Y coordinates of the top left corner of the text boxes, and we began by just grabbing them, as they seemed pretty static. They weren't.
The problem was that every time the tax program was updated, something in charge of printing out the K1s would change the coordinate positioning. Sometimes this was small, and sometimes it was massive and the whole scale would change. Because the program was changing scale drastically, we didn't think we could use bounding boxes without a lot of overlap. We kept having to add more individual sets of coordinates to our switch, and it was becoming unruly.
Then I had a thought. Up to this point we had been ignoring the lines. We didn't care about them, they were only there for formatting the info for humans to parse, right? But we were getting all the lines, their x, y, length, and horziontal/vertical tragectories. The amount of lines, their relative lengths and positions remained constant through this all. It dawned on me that I could take all the lines, sort them by their positions and lengths and have them always end up in the same order. From this I could take the xs and ys from specific lines to form bounding boxes that would dynamically be able to identify the data contained in the box.
Now we only have to update the code once per year, as the form changes, instead of every time the tax program recieves an update.
Note, if memory serves some of the text boxes top left corners for this year were printing out consistantly in a different bounding box than you would assume by looking at it. IE, the text would be inside of the box when printed, but the top left coordinates would be outside the lines. But in all those cases, the other boxes also had the same offset, so we never got data that should have been in another box.
*/
let PDFParser = require("pdf2json");
let pdfParser = new PDFParser();
let readStream = fs.createReadStream('./sampleK1.pdf');

parseK1(readStream).then(data => console.log('SUCCESS:',data)).catch(err => console.log('ERROR:',err));

function parseK1(stream) {
    return new Promise((resolve, reject) => {
        pdfParser.on("pdfParser_dataError", errData => {
            reject({errorMessage:'Failed to parse pdf data.', error:errData.parserError});
        });
        pdfParser.on("pdfParser_dataReady", pdfData => {
            let output;
            for (let page of pdfData.formImage.Pages) {
                output = extractK1FieldsFromParsedPdfPage(page.Texts, Array.from(page.HLines), Array.from(page.VLines));
                // We need at least 3 fields that line up in order to consider this a valid K1.
                // Anything less will be treated like a coincidence of positioning.
                if (!(Object.keys(output).length < 2 && output.constructor === Object)) {
                    resolve(output);
                }
            }
            reject({errorMessage:'Pdf not recognized as a valid Schedule K-1', error:output});
        });
        stream.pipe(pdfParser);
    });
};

function extractK1FieldsFromParsedPdfPage(arrayOfTexts, hLines, vLines) {
    let k1Fields = {};
    // This should make sure only numbers and dashes are present
    let tinPattern = /^[0-9\-]+$/;
    // Get lines for construction of Bounding Boxes
    const newHLines = [...hLines].sort((a,b) => (a.x === b.x) ? (a.y - b.y) : (a.x - b.x));
    const newVLines = [...vLines].sort((a,b) => (a.l === b.l) ? ((a.x === b.x) ? (a.y - b.y) : (a.x - b.x)) : (b.l - a.l));

    if (newHLines.length > 61 && newVLines.length > 4) {
        const bbXs = [0,newVLines[0].x,newVLines[2].x];
        let i_A_bb = getBoundingBox(bbXs,[newHLines[1].y,newHLines[2].y]);
        let i_B_bb = getBoundingBox(bbXs,[newHLines[2].y,newHLines[3].y]);
        let ii_E_bb = getBoundingBox(bbXs,[newHLines[6].y,newHLines[7].y]);
        let ii_F_bb = getBoundingBox(bbXs,[newHLines[7].y,newHLines[8].y]);
        let iii_5_bb = getBoundingBox([newVLines[3].x,newVLines[4].x],[newHLines[60].y,newHLines[61].y]);
        
        for(let text of arrayOfTexts) {
            let t = "";
            for (let r of text.R) {
                t += decodeURIComponent(r.T);
            }
            t = t.trim();
            let field = {
                text:t,
                x:text.x,
                y:text.y
            };
            if (isPointInBoundingBox(field,i_A_bb)) {
                //filter out known bad values in bounding box
                if (field.text != "Partnership's name, address, city, state, and ZIP code"
                && field.text != "B") {
                    if (k1Fields.i_A) {
                        k1Fields.i_A.push(field);
                    } else {
                        k1Fields.i_A = [field];
                    }
                }
            }
            if (isPointInBoundingBox(field,i_B_bb)) {
                //filter out known bad values in bounding box
                if (field.text != "IRS Center where partnership filed return"
                && field.text != "C") {
                    if (k1Fields.i_B) {
                        k1Fields.i_B.push(field);
                    } else {
                        k1Fields.i_B = [field];
                    }
                }
            }
            if (isPointInBoundingBox(field,ii_E_bb)) {
                //filter out known bad values in bounding box
                if (field.text != "Partner's name, address, city, state, and ZIP code"
                && field.text != "F") {
                    if (k1Fields.ii_E) {
                        k1Fields.ii_E.push(field);
                    } else {
                        k1Fields.ii_E = [field];
                    }
                }
            }
            if (isPointInBoundingBox(field,ii_F_bb)) {
                //filter out known bad values in bounding box
                if (field.text != "G"
                && field.text != "General partner or LLC"
                && field.text != "Limited partner or other LLC"
                && field.text != "X") {
                    if (k1Fields.ii_F) {
                        k1Fields.ii_F.push(field);
                    } else {
                        k1Fields.ii_F = [field];
                    }
                }
            }
            if (isPointInBoundingBox(field,iii_5_bb)) {
                //filter out known bad values in bounding box
                if (field.text != "Interest  income"
                && field.text != "Ordinary dividends") {
                    if (k1Fields.iii_5) {
                        k1Fields.iii_5.push(field);
                    } else {
                        k1Fields.iii_5 = [field];
                    }
                }
            }
        }
    }
    let orderedK1Fields = {};
    Object.keys(k1Fields).sort().forEach(function(key) {
      orderedK1Fields[key] = k1Fields[key];
    });
    return orderedK1Fields;
}

function getBoundingBox(xArray,yArray) {// pass in array Xs followed by array Ys, it will sort them for you.
    let bb = {
        l: Math.min(...xArray),
        r: Math.max(...xArray),
        t: Math.min(...yArray),
        b: Math.max(...yArray)
    };
    return bb;
}

function isPointInBoundingBox(p,bb) {
    if( bb.l <= p.x && p.x <= bb.r && bb.t <= p.y && p.y <= bb.b ) {
        // Point is in bounding box
        return true;    
    } else {
        return false;
    }
}
