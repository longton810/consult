const TREATMENTS = [
  ['epinephrine','Use of anesthetic with epinephrine',277,154],
  ['extractions','Extractions / oral surgery',277,168],
  ['cleaning','Deep cleaning / routine cleaning',277,183],
  ['fillings','Fillings',277,197],
  ['dentures','Dentures / Partials',520,154],
  ['crowns','Crowns / bridges',520,168],
  ['other','Other',520,183]
];
const QUESTION_PROCEDURES = [['anesthesia','local anesthesia with epinephrine'],['fillings','fillings'],['extraction','extraction'],['surgery','oral surgery'],['implant','implant'],['cleaning','cleaning']];
const CONFIRMATION = 'CONFIRM WHETHER THE PATIENT HAS BEEN MEDICALLY CLEARED';
const STORAGE_KEY = 'medical-consultation-v1';

const printable = value => String(value || '').replace(/[–—]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\t/g,' ').replace(/[^\x20-\x7E\n\r\u00A0-\u00FF]/g,'?');
const dateText = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.slice(5,7)+'/'+value.slice(8,10)+'/'+value.slice(0,4) : value || '';

const patientName = data => [data.firstName, data.lastName].filter(Boolean).map(value => value.trim()).filter(Boolean).join(' ') || data.patientName || '';

const wrapPDFText = (value,width,size,face) => {
  const lines=[];
  for (const paragraph of printable(value).replace(/\r/g,'').split('\n')) {
    let line='';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (face.widthOfTextAtSize((line?line+' ':'')+word,size)<=width) {line+=(line?' ':'')+word;continue;}
      if(line){lines.push(line);line='';}
      let part='';
      for(const char of word){if(part && face.widthOfTextAtSize(part+char,size)>width){lines.push(part);part='';}part+=char;}
      line=part;
    }
    lines.push(line);
  }
  return lines;
};

const fitPDFText = (value,font,width=245,maxLines=3,maxCharacters=180) => {
  let text=String(value || '').replace(/[\r\n]+/g,' ').slice(0,maxCharacters);
  if(font)while(text && wrapPDFText(text,width,7,font).length>maxLines)text=text.slice(0,-1);
  return text;
};

async function buildConsultationPDF(data) {
  const {PDFDocument, StandardFonts, rgb} = PDFLib;
  const pdf = await PDFDocument.load(CONSULTATION_TEMPLATE);
  // The source's third page contains only a revision date.
  if (pdf.getPageCount() === 3) pdf.removePage(2);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPage(0), overflow = [];
  const draw = (value,x,top,size=9,face=font,target=page) => target.drawText(printable(value),{x,y:target.getHeight()-top-size,size,font:face,color:rgb(0,0,0)});
  const wrap=(value,width,size,face=font)=>wrapPDFText(value,width,size,face);
  const styledLines = (value,lines,phrases,x,top,size,leading,target=page,face=font,richRuns=null) => {
    const normalized=printable(value).replace(/\s+/g,' '),ranges=[];let search=0;
    for(const phrase of phrases){const text=printable(phrase).replace(/\s+/g,' ').trim();if(!text)continue;const start=normalized.indexOf(text,search);if(start>=0){ranges.push([start,start+text.length]);search=start+text.length;}}
    if(richRuns){
      ranges.length=0;
      const raw=richRuns.map(run=>printable(run.text)).join(''),mask=richRuns.flatMap(run=>[...printable(run.text)].map(()=>!!run.bold));
      let offset=0;
      raw.replace(/\s+|\S/g,(chunk,index)=>{const length=/\s/.test(chunk[0])?1:chunk.length;if(mask[index])ranges.push([offset,offset+length]);offset+=length;return chunk;});
    }
    let cursor=0;
    lines.forEach((line,i)=>{const start=normalized.indexOf(line,cursor);if(start<0){draw(line,x,top+i*leading,size,face,target);return;}cursor=start+line.length;
      let left=x,run='',runFace=face;
      const flush=()=>{if(run){draw(run,left,top+i*leading,size,runFace,target);left+=runFace.widthOfTextAtSize(run,size);run='';}};
      [...line].forEach((char,j)=>{const next=ranges.some(([a,b])=>start+j>=a && start+j<b)?bold:face;if(next!==runFace){flush();runFace=next;}run+=char;});flush();
    });
  };
  const box = (label,value,x,top,width,height,size=10,face=font,phrases=[]) => {
    const fieldKeys={'Student name':'studentName','Practice name':'practiceName','Practice phone':'practicePhone','Practice fax':'practiceFax','Other treatment':'otherTreatment','Additional patient history':'additionalPatientHistory','Question 1':'question1','Question 2':'question2','Other findings / comments':'comments','Patient history passage':'requestPassage'};
    const key=fieldKeys[label];
    const richRuns=key && data.richRuns?.[key];
    if(richRuns){face=font;phrases=[];}

    if(!String(value || '').trim())return;
    const measureFace=phrases.length || richRuns?.some(run=>run.bold)?bold:face;
    let lines=wrap(value,width,size,measureFace);
    while(lines.length*Math.ceil(size*1.25)>height && size>7){size-=.5;lines=wrap(value,width,size,measureFace);}
    const leading=Math.ceil(size*1.25),count=Math.floor(height/leading);
    if(lines.length>count){
      overflow.push([label,String(value),phrases,richRuns]);
      const visible=lines.slice(0,Math.max(0,count-1));visible.push('(continued on page 2)');lines=visible;
    }
    styledLines(value,lines,phrases,x,top,size,leading,page,face,richRuns);
  };
  const check = (x,top) => {
    const y=792-top;
    page.drawLine({start:{x:x-2,y:y},end:{x:x,y:y-2},thickness:1.2});
    page.drawLine({start:{x:x,y:y-2},end:{x:x+4,y:y+4},thickness:1.2});
  };
  box('Student name',data.studentName,170,69,163,11,10,bold);
  box('Request date',dateText(data.requestDate),423,69,146,11,10,bold);
  box('Practice name',String(data.practiceName || '').replace(/\s*\(POD 2\)/, '\n(POD 2)'),170,83,163,22,10,bold);
  box('Practice phone',data.practicePhone,423,83,146,11,10,bold);
  box('Practice fax',data.practiceFax,423,96,146,10,10,bold);
  box('Patient name',patientName(data),170,109,163,10,10,bold);
  box('Date of birth',dateText(data.dob),423,109,146,10,10,bold);
  for(const [key,,x,top] of TREATMENTS)if(data['tx_'+key])check(x,top);
  // Replace the source's preprinted "None" in the Other treatment cell.
  page.drawRectangle({x:319,y:792-190,width:193,height:12,color:rgb(1,1,1)});
  box('Other treatment',data.tx_other ? data.otherTreatment : '',320,178,190,12,10);
  box('Patient history passage',data.requestPassage,47,261,245,33,10,font,['diagnosis','history','currentMedications'].filter(key=>data.boldFields?.[key]!==false).map(key=>data[key]));
  box('Additional patient history',fitPDFText(data.additionalPatientHistory,bold),47,300,245,33,10);
  box('Question 1',data.question1 || data.questions,303,261,275,33,10);
  box('Question 2',data.question2,303,300,275,33,10,font,[CONFIRMATION]);
  box('Other findings / comments',fitPDFText(data.comments,bold,410,3,260),168,353,410,33,10);
  let infoPage=pdf.getPage(1),cursor=96,infoBottom=435;
  const writeInfo = (label,value,phrases=[],richRuns=null) => {
    if(!String(value || '').trim())return;
    if(cursor>infoBottom-24){infoPage=pdf.addPage([612,792]);cursor=54;infoBottom=724;draw('LECOM School of Dental Medicine - Additional Information',40,cursor,12,bold,infoPage);cursor+=28;}
    draw(label,42,cursor,10,bold,infoPage);cursor+=16;
    if(richRuns)phrases=richRuns.filter(run=>run.bold).map(run=>run.text);
    const allLines=wrap(value,524,10,bold);let lineCursor=0;
    for(const line of allLines){
      if(cursor>infoBottom){infoPage=pdf.addPage([612,792]);cursor=54;infoBottom=724;draw('Additional Information (continued)',42,cursor,12,bold,infoPage);cursor+=28;}
      const normalized=printable(value).replace(/\s+/g,' '),start=normalized.indexOf(line,lineCursor);
      const relevant=phrases.flatMap(phrase=>{const text=printable(phrase).replace(/\s+/g,' ').trim(),a=normalized.indexOf(text);if(!text || a<0 || start<0)return [];const first=Math.max(a,start),last=Math.min(a+text.length,start+line.length);return last>first?[normalized.slice(first,last)]:[];});
      styledLines(line,[line],relevant,42,cursor,10,13,infoPage);lineCursor=Math.max(lineCursor,start+line.length);cursor+=13;
    }
    cursor+=16;
  };
  for(const [label,value,phrases,runs] of overflow)writeInfo(label+' (continued from page 1)',value,phrases,runs);
  pdf.setTitle('LECOM Medical Consultation Request');
  return pdf.save();
}
globalThis.ConsultationPDF = {build:buildConsultationPDF};

if(typeof document !== 'undefined') {
  const form=document.getElementById('consultationForm'),status=document.getElementById('exportStatus');
  const field=name=>form.elements.namedItem(name);
  const option = (name,label) => {
    const wrapper=document.createElement('label');wrapper.className='option';
    const input=document.createElement('input');input.type='checkbox';input.name=name;
    wrapper.append(input,document.createTextNode(label));return wrapper;
  };
  TREATMENTS.forEach(([key,label])=>document.getElementById('treatmentOptions').append(option('tx_'+key,label)));
  const boldFields={},richEditors=new Map();let savedRichRuns={};
  const passageSegments=[...document.querySelectorAll('[data-passage]')];
  const passageDefaults=passageSegments.map(el=>el.textContent);
  const read=()=>{
    const data=Object.fromEntries([...form.elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]));
    passageSegments.forEach(el=>data[el.dataset.passage]=el.textContent);
    data.requestPassage=data.passagePrefix+data.diagnosis+data.passageHistory+data.history+data.passageMedication+data.currentMedications+data.passageEnd;
    data.richRuns={};
    richEditors.forEach((entry,key)=>data.richRuns[key]=editorRuns(entry.editor));
    data.richRuns.requestPassage=['passagePrefix','diagnosis','passageHistory','history','passageMedication','currentMedications','passageEnd'].flatMap(key=>data.richRuns[key] || [{text:data[key] || '',bold:false}]);
    return data;
  };
  const syncQuestion2=()=>{
    const selected=QUESTION_PROCEDURES.filter(([key])=>field('q2_'+key).checked).map(([,label])=>label);
    const input=field('question2'),match=/\bsuch as\b/i.exec(input.value);
    const prefix=match ? input.value.slice(0,match.index+match[0].length).trimEnd() : input.value.trimEnd()+' such as';
    input.value=prefix+(selected.length?' '+selected.join(', ')+'.':'');
    if(richEditors.has('question2'))syncRichValue('question2');
  };
  let historyFont=null;
  const limitAdditionalHistory=()=>{
    const input=field('additionalPatientHistory');
    input.value=fitPDFText(input.value,historyFont);
    document.getElementById('historyLimit').textContent=input.value.length+' / 180 characters · Limited to the PDF space';
    const comments=field('comments');
    comments.value=fitPDFText(comments.value,historyFont,410,3,260);
    document.getElementById('commentsLimit').textContent=comments.value.length+' / 260 characters · Limited to the PDF space';
  };
  const update=()=>{
    limitAdditionalHistory();
    TREATMENTS.forEach(([key])=>{const input=field('tx_'+key);input.closest('label').classList.toggle('selected',input.checked);});
    document.getElementById('otherTreatmentField').hidden=!field('tx_other').checked;
  };
  const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(read()));document.getElementById('saveStatus').textContent='Saved on this device.';}catch{document.getElementById('saveStatus').textContent='Autosave unavailable.';}};
  try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(saved && saved.patientName && !saved.firstName && !saved.lastName){const parts=saved.patientName.trim().split(/\s+/);saved.lastName=parts.length>1?parts.pop():'';saved.firstName=parts.join(' ');}
    if(saved && saved.studentName==='Long Ton')saved.studentName='Long T. Ton';
    if(saved && typeof saved.practiceName==='string')saved.practiceName=saved.practiceName.replace('LECOM - Erie Dental Office (POD 2)','LECOM - Erie Dental Offices\n(POD 2)').replace('LECOM - Erie Dental Office\n(POD 2)','LECOM - Erie Dental Offices\n(POD 2)');
    if(saved && saved.questions && saved.question1 === undefined){saved.question1=saved.questions;saved.question2='';}
    if(saved && saved.requestPassage && saved.passagePrefix === undefined){
      const parts=/^The patient was diagnosed with ([\s\S]*?) and history of ([\s\S]*?) and is currently taking ([\s\S]*?)\.$/.exec(saved.requestPassage);
      if(parts){saved.diagnosis=parts[1]==='__'?'':parts[1];saved.history=parts[2]==='__'?'':parts[2];saved.currentMedications=parts[3]==='__'?'':parts[3];}
      else {saved.passagePrefix=saved.requestPassage;saved.passageHistory='';saved.passageMedication='';saved.passageEnd='';saved.diagnosis='';saved.history='';saved.currentMedications='';}
    }
    if(saved && saved.richRuns && typeof saved.richRuns==='object')savedRichRuns=saved.richRuns;
    if(saved && saved.boldFields)Object.assign(boldFields,saved.boldFields);
    if(saved)passageSegments.forEach(el=>{if(typeof saved[el.dataset.passage]==='string')el.textContent=saved[el.dataset.passage];});
    if(saved)for(const [name,value]of Object.entries(saved)){const input=field(name);if(!input)continue;if(input.type==='checkbox')input.checked=value===true;else if(typeof value==='string'){if(['practiceName','practicePhone','practiceFax'].includes(name) && !value.trim())continue;input.value=name==='practiceName'?value.replace(/\s*\(POD 2\)/, '\n(POD 2)'):value;}}}catch{}
  const pasteText=event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));};
  const markChanged=()=>{save();status.textContent='Changes ready. Update the preview or download the filled form.';};
  const editorRuns=editor=>{
    const runs=[];
    const walk=(node,isBold=false)=>{
      if(node.nodeType===3){if(node.textContent)runs.push({text:node.textContent,bold:isBold});return;}
      if(node.nodeType!==1)return;
      if(node.tagName==='BR'){runs.push({text:'\n',bold:false});return;}
      if(['DIV','P'].includes(node.tagName) && runs.length && !runs.at(-1).text.endsWith('\n'))runs.push({text:'\n',bold:false});
      const weight=node.style.fontWeight;
      const next=weight?Number(weight)>=600 || weight==='bold':isBold || ['B','STRONG'].includes(node.tagName);
      node.childNodes.forEach(child=>walk(child,next));
    };
    editor.childNodes.forEach(node=>walk(node));return runs;
  };
  const paint=(editor,runs)=>{editor.replaceChildren();for(const run of runs){if(typeof run.text!=='string')continue;const node=document.createTextNode(run.text);if(run.bold){const strong=document.createElement('strong');strong.append(node);editor.append(strong);}else editor.append(node);}};
  const initialRuns=(key,text,initial)=>{
    if(key==='question2'){const phrase=CONFIRMATION,at=text.indexOf(phrase);if(at>=0)return [{text:text.slice(0,at),bold:false},{text:phrase,bold:true},{text:text.slice(at+phrase.length),bold:false}];}
    return [{text,bold:initial}];
  };
  const boldControls=[];
  for(const input of [...form.elements].filter(el=>el.name && (el.tagName==='TEXTAREA' || el.type==='text') && !el.closest('.information-grid'))){
    const initial=['diagnosis','history','currentMedications'].includes(input.name),editor=document.createElement('div');
    editor.className='rich-blank';editor.contentEditable='true';editor.dataset.richKey=input.name;editor.setAttribute('role','textbox');editor.setAttribute('aria-label',input.getAttribute('aria-label') || input.closest('label')?.firstChild?.textContent || input.name);editor.setAttribute('aria-multiline',String(input.tagName==='TEXTAREA'));editor.dataset.placeholder=input.placeholder || '';
    if(input.tagName!=='TEXTAREA')editor.classList.add('inline-rich');
    const defaults=initialRuns(input.name,input.defaultValue,initial),current=initialRuns(input.name,input.value,boldFields[input.name] ?? initial);
    paint(editor,Array.isArray(savedRichRuns[input.name])?savedRichRuns[input.name]:current);input.before(editor);input.hidden=true;
    const sync=()=>{input.value=editorRuns(editor).map(run=>run.text).join('');};sync();
    richEditors.set(input.name,{editor,input,sync});
    editor.addEventListener('input',()=>{sync();const previous=input.value;update();if(input.value!==previous){let remaining=input.value.length;const runs=editorRuns(editor).map(run=>{const text=run.text.slice(0,Math.max(0,remaining));remaining-=text.length;return {text,bold:run.bold};});paint(editor,runs);const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}markChanged();});
    editor.addEventListener('paste',pasteText);
    editor.addEventListener('keydown',event=>{if(editor.classList.contains('inline-rich') && event.key==='Enter')event.preventDefault();});
    boldControls.push(()=>{paint(editor,defaults);sync();});
  }
  passageSegments.forEach(editor=>{editor.contentEditable='true';editor.addEventListener('paste',pasteText);editor.dataset.richKey=editor.dataset.passage;richEditors.set(editor.dataset.passage,{editor,sync:()=>{}});if(Array.isArray(savedRichRuns[editor.dataset.passage]))paint(editor,savedRichRuns[editor.dataset.passage]);});
  const floatingBold=document.createElement('button');floatingBold.type='button';floatingBold.className='selection-bold';floatingBold.textContent='Bold';floatingBold.hidden=true;floatingBold.setAttribute('aria-label','Toggle bold on selected text');document.body.append(floatingBold);
  let selectedRange=null,selectedEditor=null;
  document.addEventListener('selectionchange',()=>{
    const selection=window.getSelection();if(!selection.rangeCount || selection.isCollapsed){floatingBold.hidden=true;return;}
    const range=selection.getRangeAt(0),node=range.commonAncestorContainer,element=node.nodeType===1?node:node.parentElement,editor=element.closest('[data-rich-key]');
    if(!editor || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)){floatingBold.hidden=true;return;}
    selectedRange=range.cloneRange();selectedEditor=editor;
    const rect=range.getBoundingClientRect();floatingBold.hidden=false;floatingBold.style.left=Math.max(8,Math.min(innerWidth-80,rect.left))+'px';floatingBold.style.top=Math.max(8,rect.top-38)+'px';floatingBold.setAttribute('aria-pressed',String(document.queryCommandState('bold')));
  });
  floatingBold.addEventListener('pointerdown',event=>event.preventDefault());
  floatingBold.addEventListener('click',()=>{
    if(!selectedRange || !selectedEditor)return;selectedEditor.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(selectedRange);document.execCommand('bold');richEditors.get(selectedEditor.dataset.richKey)?.sync();save();floatingBold.setAttribute('aria-pressed',String(document.queryCommandState('bold')));status.textContent='Formatting changed. Update the preview or download the filled form.';
  });
  const syncRichValue=(key)=>{const entry=richEditors.get(key);if(entry)paint(entry.editor,initialRuns(key,entry.input.value,false));};
  if([...form.elements].some(input=>input.name && input.name.startsWith('q2_') && input.checked))syncQuestion2();
  PDFLib.PDFDocument.create().then(pdf=>pdf.embedFont(PDFLib.StandardFonts.HelveticaBold)).then(font=>{historyFont=font;limitAdditionalHistory();}).catch(()=>{});
  update();form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('input',event=>{if(event.target.name && event.target.name.startsWith('q2_'))syncQuestion2();update();markChanged();});
  let previewURL='';
  const showPreview=bytes=>{if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));document.getElementById('pdfPreview').src=previewURL;};
  const run=async download=>{
    const buttons=[document.getElementById('previewForm'),document.getElementById('downloadForm')];buttons.forEach(b=>b.disabled=true);status.textContent='Preparing form…';
    try{const data=read(),bytes=await buildConsultationPDF(data);showPreview(bytes);if(download){const link=document.createElement('a');link.href=previewURL;link.download='Medical-consultation'+(patientName(data).trim()?' - '+patientName(data).trim().replace(/[^a-zA-Z0-9 -]/g,''):'')+'.pdf';link.click();}status.textContent=download?'Filled PDF downloaded.':'Preview updated.';}catch(error){status.textContent='Could not create the PDF: '+error.message;}finally{buttons.forEach(b=>b.disabled=false);}
  };
  document.getElementById('previewForm').addEventListener('click',()=>run(false));document.getElementById('downloadForm').addEventListener('click',()=>run(true));
  const dialog=document.getElementById('clearDialog');document.getElementById('clearAll').addEventListener('click',()=>dialog.showModal());document.getElementById('cancelClear').addEventListener('click',()=>dialog.close());document.getElementById('confirmClear').addEventListener('click',()=>{form.reset();boldControls.forEach(reset=>reset());passageSegments.forEach((el,i)=>el.textContent=passageDefaults[i]);update();save();dialog.close();run(false);});
  run(false);
}
