# Medical Consultation

A standalone LECOM consultation form tool with the Odontogram glass panel design.

## Open and use

Open `index.html` locally, or visit the published GitHub Pages site. No installation is required.

- Information fields are always bold. Student name starts blank. Other defaults: LECOM - Erie Dental Offices (POD 2), (814) 868 1001, and (814) 868 1039.
- Edit the wording of the patient history passage and its three embedded blanks.
- Select text in the other blanks to show the Bold button. Formatting is saved and included in the PDF.
- Selected Question 2 procedures appear after “such as.”
- Additional patient history allows up to 180 characters; Other findings/comments allows up to 260. Both also check the available PDF space.
- Update preview refreshes the form. Download filled PDF saves a static PDF. Revise entries on the page to export a new copy.
- Clear All restores the defaults. Entries save in this browser on this device.

## Upload to GitHub

1. Extract the ZIP and open the MedicalConsultation folder.
2. Use a repository named `consult` and upload its contents to the repository root: `index.html`, `style.css`, `script.js`, `PDF-LIB-LICENSE.md`, `.nojekyll`, and this README. Do not upload the ZIP itself or nest everything in another MedicalConsultation folder.
3. In repository Settings → Pages, choose Deploy from a branch, select `main` and `/ (root)`, and save.
4. Wait for deployment to finish, then open the published link.

For updates, replace the existing files in the same locations and commit the changes. You do not need to delete the old files first.

## Included assets

`script.js` bundles the PDF library, the original first page, your replacement second page, and the application. Upload the three main files together; no assets folder is required. Keep `PDF-LIB-LICENSE.md` for the included library license.

Signatures and physician response spaces remain available on the original form. Long unrestricted passages continue onto page 2 or additional pages when necessary. The PDF uses Helvetica for entered text; the webpage uses Arial.
